-- Tell "the season is over" apart from "the season is over and the playoffs
-- haven't been drawn yet".
--
-- The dashboard hides a competition once the team has matches and none of them
-- are upcoming. That reads as "your run is finished", and for a wrapped-up
-- season it is right. But it is exactly the state a league sits in between the
-- last round-robin game being scored and the organizer generating the playoff
-- bracket — every match completed, none upcoming, nothing scheduled yet.
--
-- The competition is still very much live at that point: the standings decide
-- the seeding, and the players want to look at them. Instead they lost the
-- league from their dashboard entirely, along with the links to their team and
-- the standings.
--
-- `competitions.status` cannot settle it — a mid-season league reads 'open'
-- whether or not its playoffs exist — so the dashboard needs to know HOW LONG
-- the team has had nothing to play. Days since the last match separates a
-- fortnight-old season waiting on a bracket from one that ended in the spring.
--
-- Adding a column changes the return type, which `create or replace` cannot do.

drop function if exists public.my_competitions();
--> statement-breakpoint

create or replace function public.my_competitions()
returns table (
  competition_id uuid,
  slug text,
  name text,
  type competition_type,
  sport sport,
  status competition_status,
  team_id uuid,
  team_name text,
  member_role team_member_role,
  team_status team_status,
  next_match_id uuid,
  next_scheduled_at timestamptz,
  next_round int,
  next_court text,
  next_home_name text,
  next_away_name text,
  has_matches boolean,
  last_match_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    c.id, c.slug, c.name, c.type, c.sport, c.status,
    t.id, t.name, tm.role, t.status,
    nm.id, nm.scheduled_at, nm.round, nm.court, hn.name, an.name,
    exists (
      select 1 from matches m
      where m.home_team_id = t.id or m.away_team_id = t.id
    ) as has_matches,
    (
      -- The team's most recent scheduled match, played or not. Null when the
      -- schedule carries no times at all, which the caller reads as "no idea
      -- how long ago" and keeps the competition visible.
      select max(m.scheduled_at) from matches m
      where m.home_team_id = t.id or m.away_team_id = t.id
    ) as last_match_at
  from team_members tm
  join teams t on t.id = tm.team_id
  join competitions c on c.id = t.competition_id
  left join lateral (
    select m.*
    from matches m
    where (m.home_team_id = t.id or m.away_team_id = t.id)
      and m.status not in ('completed', 'cancelled')
    order by m.scheduled_at asc nulls last,
             m.round asc nulls last,
             m.court asc nulls last
    limit 1
  ) nm on true
  left join teams hn on hn.id = nm.home_team_id
  left join teams an on an.id = nm.away_team_id
  where tm.user_id = auth.uid()
  order by c.start_date desc nulls last, c.name;
$$;
--> statement-breakpoint
grant execute on function public.my_competitions() to authenticated;
