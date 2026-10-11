-- Alignment night in the app — scores in, ranking out.
--
-- BVL opens a season with an alignment night: every team pre-ranked, grouped
-- into 6-team sessions that play "Standard Schedule B" (five rounds of timed
-- games), and at D'Youville "keeps the highest ranked two teams and brings in
-- 4 new teams in the second and third time slots" (Indru, 2026-10-10). Until
-- now onsites moved teams by hand and Indru ranked everyone on paper. Owner:
-- "Why cant we just capture all the scores in the app and then decide
-- ranking? The app is to make their life easier."
--
-- A session's six seats are teams by letter A–F (`seeds`); a climb session's
-- seats E and F are empty until the session it climbs from (`climb_from`) is
-- finished. When a session's last game is completed, a trigger ranks it —
-- wins, then +/- with each game's margin capped at 15 (BVL's sheet rule:
-- "Maximum recorded difference margin is 15 POINTS"), then seed — stores the
-- order, and fills the next session's E/F seats and games with its top two.
--
-- `place_ranks` maps each finishing place to an overall rank (null = moves on
-- to the next session) — data, not code, because how sessions combine into one
-- 1–N ranking is BVL's rule to confirm. `alignment_ranking` reads it.

create table if not exists "alignment_sessions" (
  "id" uuid primary key default gen_random_uuid(),
  "competition_id" uuid not null references "competitions"("id") on delete cascade,
  "seq" integer not null,
  "venue_id" uuid references "venues"("id") on delete set null,
  "starts_at" timestamptz not null,
  -- Teams in seat order A..F; null = filled from `climb_from`'s top two.
  "seeds" uuid[] not null,
  "climb_from" uuid references "alignment_sessions"("id") on delete set null,
  -- Overall rank for finishing places 1..n; null = climbs to the next session.
  "place_ranks" integer[] not null,
  -- [{ "match_id": uuid, "home": "A", "away": "F" }, …] — which seats each game is.
  "fixtures" jsonb not null default '[]'::jsonb,
  -- Finishing order once complete.
  "placings" uuid[],
  "completed_at" timestamptz,
  "created_at" timestamptz not null default now(),
  unique ("competition_id", "seq")
);
--> statement-breakpoint
alter table "matches"
  add column if not exists "alignment_session_id" uuid references "alignment_sessions"("id") on delete set null;
--> statement-breakpoint
create index if not exists "matches_alignment_session_idx" on "matches" ("alignment_session_id")
  where "alignment_session_id" is not null;
--> statement-breakpoint

alter table "alignment_sessions" enable row level security;
--> statement-breakpoint
drop policy if exists "alignment_sessions_read" on "alignment_sessions";
--> statement-breakpoint
create policy "alignment_sessions_read" on "alignment_sessions"
  for select using (public.can_view_schedule(competition_id));
--> statement-breakpoint
drop policy if exists "alignment_sessions_write" on "alignment_sessions";
--> statement-breakpoint
create policy "alignment_sessions_write" on "alignment_sessions"
  for all to authenticated
  using (public.is_competition_admin(competition_id))
  with check (public.is_competition_admin(competition_id));
--> statement-breakpoint

-- A session's standings from its completed games: wins, then +/- capped at 15
-- a game, then seat (A before B). One set per game; a level game is no win.
create or replace function public.alignment_standings_core(_session uuid)
returns table (team_id uuid, wins integer, plus_minus integer, seat integer)
language sql
stable
security definer
set search_path = public
as $$
  with s as (select seeds from alignment_sessions where id = _session),
  seat as (
    select t.team_id, t.ord::int as seat
      from s, unnest(s.seeds) with ordinality as t(team_id, ord)
     where t.team_id is not null
  ),
  games as (
    select m.home_team_id h, m.away_team_id a,
           coalesce(sum(st.home_score), 0) hs, coalesce(sum(st.away_score), 0) aws
      from matches m
      left join sets st on st.match_id = m.id
     where m.alignment_session_id = _session and m.status = 'completed'
     group by m.id
  ),
  per as (
    select h as team_id, (hs > aws)::int w, greatest(-15, least(15, hs - aws)) pm from games
    union all
    select a, (aws > hs)::int, greatest(-15, least(15, aws - hs)) from games
  )
  select seat.team_id,
         coalesce(sum(per.w), 0)::int,
         coalesce(sum(per.pm), 0)::int,
         seat.seat
    from seat
    left join per on per.team_id = seat.team_id
   group by seat.team_id, seat.seat
   order by 2 desc, 3 desc, 4 asc;
$$;
--> statement-breakpoint
revoke all on function public.alignment_standings_core(uuid) from public;
--> statement-breakpoint
-- The same, for anyone the schedule is shown to.
create or replace function public.alignment_session_standings(_session uuid)
returns table (team_id uuid, wins integer, plus_minus integer, seat integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.* from public.alignment_standings_core(_session) c
   where exists (
     select 1 from alignment_sessions s
      where s.id = _session and public.can_view_schedule(s.competition_id)
   );
$$;
--> statement-breakpoint
grant execute on function public.alignment_session_standings(uuid) to anon, authenticated;
--> statement-breakpoint

-- Finish a session once every game is completed: store its order, and move
-- its top two into the session that climbs from it.
create or replace function public.alignment_advance(_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _order uuid[];
  _next record;
  _seeds uuid[];
  _f jsonb;
  _letters text := 'ABCDEF';
begin
  if exists (
    select 1 from matches where alignment_session_id = _session and status <> 'completed'
  ) or not exists (select 1 from matches where alignment_session_id = _session) then
    return;
  end if;
  select array_agg(team_id order by wins desc, plus_minus desc, seat asc)
    into _order from public.alignment_standings_core(_session);
  update alignment_sessions set placings = _order, completed_at = coalesce(completed_at, now())
   where id = _session;

  for _next in select * from alignment_sessions where climb_from = _session loop
    -- Never re-seat a session with a result in it.
    continue when exists (
      select 1 from matches where alignment_session_id = _next.id and status = 'completed'
    );
    -- The climbers take the last two seats (E and F): 1st, then 2nd.
    _seeds := _next.seeds;
    _seeds[array_length(_seeds, 1) - 1] := _order[1];
    _seeds[array_length(_seeds, 1)] := _order[2];
    update alignment_sessions set seeds = _seeds where id = _next.id;
    for _f in select * from jsonb_array_elements(_next.fixtures) loop
      update matches set
        home_team_id = _seeds[strpos(_letters, _f->>'home')],
        away_team_id = _seeds[strpos(_letters, _f->>'away')]
       where id = (_f->>'match_id')::uuid;
    end loop;
  end loop;
end;
$$;
--> statement-breakpoint
revoke all on function public.alignment_advance(uuid) from public;
--> statement-breakpoint

create or replace function public.matches_alignment_advance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.alignment_session_id is null then
    return null;
  end if;
  -- Every save rewrites the sets and then the status, so a corrected score
  -- re-ranks the session too (advance never re-seats one that has started).
  if new.status = 'completed' then
    perform public.alignment_advance(new.alignment_session_id);
  -- A cleared game reopens its session: no placings until it's played again.
  elsif tg_op = 'UPDATE' and old.status = 'completed' then
    update alignment_sessions set placings = null, completed_at = null
     where id = new.alignment_session_id;
  end if;
  return null;
end;
$$;
--> statement-breakpoint
drop trigger if exists "matches_alignment_advance" on "matches";
--> statement-breakpoint
create trigger "matches_alignment_advance"
  after insert or update of "status" on "matches"
  for each row execute function public.matches_alignment_advance();
--> statement-breakpoint

-- The night's 1–N ranking, once every session is finished: each session's
-- places mapped through `place_ranks`. Empty until the night is complete.
create or replace function public.alignment_ranking(_competition_id uuid)
returns table (rank integer, team_id uuid, session_seq integer, place integer)
language sql
stable
security definer
set search_path = public
as $$
  select pr.r::int, s.placings[pr.place::int], s.seq, pr.place::int
    from alignment_sessions s,
         unnest(s.place_ranks) with ordinality as pr(r, place)
   where s.competition_id = _competition_id
     and public.can_view_schedule(_competition_id)
     and pr.r is not null
     and not exists (
       select 1 from alignment_sessions x
        where x.competition_id = _competition_id and x.placings is null
     )
   order by 1;
$$;
--> statement-breakpoint
grant execute on function public.alignment_ranking(uuid) to anon, authenticated;
