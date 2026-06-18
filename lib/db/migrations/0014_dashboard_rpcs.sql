-- Slice 2: player/captain dashboard data.
--
-- These SECURITY DEFINER functions return only the *caller's own* rows, keyed on
-- auth.uid() (and, for invites, the caller's verified users.email) — never on
-- client-supplied input. They let a member see a competition they're in even if
-- it isn't public, and surface a pending invite addressed to their email,
-- without broadening table RLS.

-- Competitions the caller is a member of (via team_members), with their team and
-- next (unplayed) match.
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
  next_away_name text
)
language sql stable security definer set search_path = public as $$
  select
    c.id, c.slug, c.name, c.type, c.sport, c.status,
    t.id, t.name, tm.role, t.status,
    nm.id, nm.scheduled_at, nm.round, nm.court, hn.name, an.name
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
--> statement-breakpoint

-- Pending invites addressed to the caller's email (matched case-insensitively
-- against their own users.email — not any client value).
create or replace function public.my_pending_invites()
returns table (
  invite_id uuid,
  token text,
  team_id uuid,
  team_name text,
  competition_id uuid,
  competition_name text,
  competition_slug text,
  competition_type competition_type
)
language sql stable security definer set search_path = public as $$
  select i.id, i.token, t.id, t.name, c.id, c.name, c.slug, c.type
  from team_invites i
  join teams t on t.id = i.team_id
  join competitions c on c.id = t.competition_id
  where i.status = 'pending'
    and lower(i.email) = lower((select u.email from users u where u.id = auth.uid()))
  order by i.created_at desc;
$$;
--> statement-breakpoint
grant execute on function public.my_pending_invites() to authenticated;