-- Alignment night: BVL's tiebreak within a session (Indru, 2026-10-10):
-- "Wins; head to head; +/- head to head for tied teams; overall +/-."
--
-- 0165 went wins → overall +/- → seat. Now, among teams level on wins: wins
-- in the games between just those teams, then +/- in those games, then
-- overall +/- (every game's margin capped at 15, BVL's sheet rule), then seat
-- as the last resort. One pass over each group of tied teams — with three or
-- more level, the mini-table among them decides, it is not re-run on a
-- subset that is still level.
--
-- The functions gain a `place` column, so the return type changes: drop and
-- recreate. `alignment_advance` now takes the order from `place`.

drop function if exists public.alignment_session_standings(uuid);
--> statement-breakpoint
drop function if exists public.alignment_standings_core(uuid);
--> statement-breakpoint
create function public.alignment_standings_core(_session uuid)
returns table (
  place integer,
  team_id uuid,
  wins integer,
  plus_minus integer,
  h2h_wins integer,
  h2h_plus_minus integer,
  seat integer
)
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
    select h as team_id, a as opp, (hs > aws)::int w, greatest(-15, least(15, hs - aws)) pm from games
    union all
    select a, h, (aws > hs)::int, greatest(-15, least(15, aws - hs)) from games
  ),
  tot as (
    select seat.team_id, seat.seat,
           coalesce(sum(per.w), 0)::int wins,
           coalesce(sum(per.pm), 0)::int pm
      from seat
      left join per on per.team_id = seat.team_id
     group by seat.team_id, seat.seat
  ),
  -- Games between teams on the same number of wins.
  h2h as (
    select me.team_id, sum(per.w)::int w, sum(per.pm)::int pm
      from tot me
      join per on per.team_id = me.team_id
      join tot o on o.team_id = per.opp and o.wins = me.wins
     group by me.team_id
  )
  select (row_number() over (
            order by tot.wins desc, coalesce(h2h.w, 0) desc,
                     coalesce(h2h.pm, 0) desc, tot.pm desc, tot.seat asc
          ))::int,
         tot.team_id, tot.wins, tot.pm,
         coalesce(h2h.w, 0), coalesce(h2h.pm, 0), tot.seat
    from tot
    left join h2h on h2h.team_id = tot.team_id
   order by 1;
$$;
--> statement-breakpoint
revoke all on function public.alignment_standings_core(uuid) from public;
--> statement-breakpoint
create function public.alignment_session_standings(_session uuid)
returns table (
  place integer,
  team_id uuid,
  wins integer,
  plus_minus integer,
  h2h_wins integer,
  h2h_plus_minus integer,
  seat integer
)
language sql
stable
security definer
set search_path = public
as $$
  select c.* from public.alignment_standings_core(_session) c
   where exists (
     select 1 from alignment_sessions s
      where s.id = _session and public.can_view_schedule(s.competition_id)
   )
   order by c.place;
$$;
--> statement-breakpoint
grant execute on function public.alignment_session_standings(uuid) to anon, authenticated;
--> statement-breakpoint

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
  select array_agg(team_id order by place)
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
