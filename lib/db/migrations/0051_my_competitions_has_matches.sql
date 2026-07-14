-- Add a team-scoped `has_matches` flag to my_competitions so the dashboard can
-- tell "this team's run is over" (had matches, none left to play) apart from
-- "no schedule yet" (no matches at all). Competition.status is unreliable for
-- this — a mid-tournament competition can still read 'scheduled'/'open' — so we
-- key off the team's own matches instead.
--
-- Adding a column changes the function's return type, which `create or replace`
-- can't do — drop it first.
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
  has_matches boolean
)
language sql stable security definer set search_path = public as $$
  select
    c.id, c.slug, c.name, c.type, c.sport, c.status,
    t.id, t.name, tm.role, t.status,
    nm.id, nm.scheduled_at, nm.round, nm.court, hn.name, an.name,
    exists (
      select 1 from matches m
      where m.home_team_id = t.id or m.away_team_id = t.id
    ) as has_matches
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
