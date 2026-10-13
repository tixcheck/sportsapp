-- Alignment night: how many teams climb into a session, per session.
--
-- 0165 always moved two. BVL Non-Spiking ended up with 25 teams (no INDY
-- team, V 2026-10-12); Indru's fix (2026-10-12): "Top Gun will come at 6:15.
-- So we'll have six in the first session then keep three for the subsequent
-- session." So D'Youville 7:30 takes the 6:15's top THREE, the 8:40 still the
-- 7:30's top two.
--
-- `climbers` is how many of a session's LAST seats are filled from the
-- session it climbs from, 1st place first. Stored rather than inferred from
-- null seeds, because the seeds stop being null the moment the climbers are
-- seated, and a corrected score upstream must be able to re-seat them.

alter table "alignment_sessions"
  add column if not exists "climbers" integer not null default 2;
--> statement-breakpoint
alter table "alignment_sessions" drop constraint if exists "alignment_sessions_climbers_check";
--> statement-breakpoint
alter table "alignment_sessions" add constraint "alignment_sessions_climbers_check"
  check (climbers between 0 and 6);
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
  _n integer;
  _i integer;
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
    -- The climbers take the last `climbers` seats, 1st place first.
    _seeds := _next.seeds;
    _n := array_length(_seeds, 1);
    for _i in 1.._next.climbers loop
      _seeds[_n - _next.climbers + _i] := _order[_i];
    end loop;
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
