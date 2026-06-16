-- Row-Level Security (PRD §9).
--
-- Core rules from the spec:
--   * A user can SELECT a competition if it's public OR they're an org_member
--     OR they're a team_member.
--   * A user can INSERT/UPDATE matches/sets if they captain one of the teams.
--   * Org owners/admins can do anything within their org's competitions.
--
-- Child tables follow the spirit: readable to anyone who can view the parent
-- competition; writable by org admins (and, for the match-scoped tables, by the
-- relevant team captain).
--
-- Helper functions are SECURITY DEFINER so policy checks can read membership
-- tables without recursively triggering their own RLS. `users.id` equals
-- Supabase `auth.uid()`. Seed/admin jobs connect as the table-owner role and
-- bypass RLS; the secret-key (service_role) path bypasses it too.

-- ===========================================================================
-- Helper functions
-- ===========================================================================

create or replace function public.is_org_member(_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members m
    where m.org_id = _org_id and m.user_id = auth.uid()
  );
$$;
--> statement-breakpoint

create or replace function public.is_org_admin(_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members m
    where m.org_id = _org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;
--> statement-breakpoint

create or replace function public.can_view_competition(_competition_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from competitions c
    where c.id = _competition_id
      and (
        c.visibility = 'public'
        or public.is_org_member(c.org_id)
        or exists (
          select 1 from teams t
          join team_members tm on tm.team_id = t.id
          where t.competition_id = c.id and tm.user_id = auth.uid()
        )
      )
  );
$$;
--> statement-breakpoint

create or replace function public.is_competition_admin(_competition_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from competitions c
    where c.id = _competition_id and public.is_org_admin(c.org_id)
  );
$$;
--> statement-breakpoint

create or replace function public.is_team_captain(_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from teams t
    where t.id = _team_id and t.captain_user_id = auth.uid()
  );
$$;
--> statement-breakpoint

create or replace function public.is_match_captain(_match_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches m
    join teams t on t.id in (m.home_team_id, m.away_team_id)
    where m.id = _match_id and t.captain_user_id = auth.uid()
  );
$$;
--> statement-breakpoint

create or replace function public.is_match_competition_admin(_match_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches m
    where m.id = _match_id and public.is_competition_admin(m.competition_id)
  );
$$;
--> statement-breakpoint

create or replace function public.can_view_match(_match_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches m
    where m.id = _match_id and public.can_view_competition(m.competition_id)
  );
$$;
--> statement-breakpoint

create or replace function public.shares_context_with(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members m1
    join org_members m2 on m1.org_id = m2.org_id
    where m1.user_id = auth.uid() and m2.user_id = _user_id
  ) or exists (
    select 1 from team_members t1
    join team_members t2 on t1.team_id = t2.team_id
    where t1.user_id = auth.uid() and t2.user_id = _user_id
  );
$$;
--> statement-breakpoint

-- ===========================================================================
-- Enable RLS
-- ===========================================================================

alter table "users" enable row level security;--> statement-breakpoint
alter table "organizations" enable row level security;--> statement-breakpoint
alter table "org_members" enable row level security;--> statement-breakpoint
alter table "competitions" enable row level security;--> statement-breakpoint
alter table "league_settings" enable row level security;--> statement-breakpoint
alter table "tournament_settings" enable row level security;--> statement-breakpoint
alter table "divisions" enable row level security;--> statement-breakpoint
alter table "pools" enable row level security;--> statement-breakpoint
alter table "teams" enable row level security;--> statement-breakpoint
alter table "team_members" enable row level security;--> statement-breakpoint
alter table "matches" enable row level security;--> statement-breakpoint
alter table "sets" enable row level security;--> statement-breakpoint
alter table "match_confirmations" enable row level security;--> statement-breakpoint
alter table "match_audit" enable row level security;--> statement-breakpoint
alter table "standings_cache" enable row level security;--> statement-breakpoint

-- ===========================================================================
-- users  (self or someone who shares an org/team with you)
-- ===========================================================================

create policy "users_select" on "users"
  for select using (id = auth.uid() or public.shares_context_with(id));--> statement-breakpoint
create policy "users_insert_self" on "users"
  for insert to authenticated with check (id = auth.uid());--> statement-breakpoint
create policy "users_update_self" on "users"
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());--> statement-breakpoint

-- ===========================================================================
-- organizations  (org info is shown on public competition pages → public read)
-- ===========================================================================

create policy "organizations_select" on "organizations"
  for select using (true);--> statement-breakpoint
create policy "organizations_insert_owner" on "organizations"
  for insert to authenticated with check (owner_user_id = auth.uid());--> statement-breakpoint
create policy "organizations_update_admin" on "organizations"
  for update to authenticated using (public.is_org_admin(id)) with check (public.is_org_admin(id));--> statement-breakpoint
create policy "organizations_delete_admin" on "organizations"
  for delete to authenticated using (public.is_org_admin(id));--> statement-breakpoint

-- ===========================================================================
-- org_members
-- ===========================================================================

create policy "org_members_select" on "org_members"
  for select using (user_id = auth.uid() or public.is_org_member(org_id));--> statement-breakpoint
create policy "org_members_admin_all" on "org_members"
  for all to authenticated using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));--> statement-breakpoint

-- ===========================================================================
-- competitions
-- ===========================================================================

create policy "competitions_select" on "competitions"
  for select using (public.can_view_competition(id));--> statement-breakpoint
create policy "competitions_admin_all" on "competitions"
  for all to authenticated using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));--> statement-breakpoint

-- ===========================================================================
-- league_settings / tournament_settings
-- ===========================================================================

create policy "league_settings_select" on "league_settings"
  for select using (public.can_view_competition(competition_id));--> statement-breakpoint
create policy "league_settings_admin_all" on "league_settings"
  for all to authenticated using (public.is_competition_admin(competition_id)) with check (public.is_competition_admin(competition_id));--> statement-breakpoint

create policy "tournament_settings_select" on "tournament_settings"
  for select using (public.can_view_competition(competition_id));--> statement-breakpoint
create policy "tournament_settings_admin_all" on "tournament_settings"
  for all to authenticated using (public.is_competition_admin(competition_id)) with check (public.is_competition_admin(competition_id));--> statement-breakpoint

-- ===========================================================================
-- divisions / pools
-- ===========================================================================

create policy "divisions_select" on "divisions"
  for select using (public.can_view_competition(competition_id));--> statement-breakpoint
create policy "divisions_admin_all" on "divisions"
  for all to authenticated using (public.is_competition_admin(competition_id)) with check (public.is_competition_admin(competition_id));--> statement-breakpoint

create policy "pools_select" on "pools"
  for select using (public.can_view_competition(competition_id));--> statement-breakpoint
create policy "pools_admin_all" on "pools"
  for all to authenticated using (public.is_competition_admin(competition_id)) with check (public.is_competition_admin(competition_id));--> statement-breakpoint

-- ===========================================================================
-- teams
-- ===========================================================================

create policy "teams_select" on "teams"
  for select using (public.can_view_competition(competition_id));--> statement-breakpoint
create policy "teams_admin_all" on "teams"
  for all to authenticated using (public.is_competition_admin(competition_id)) with check (public.is_competition_admin(competition_id));--> statement-breakpoint

-- ===========================================================================
-- team_members  (admins of the competition, or the team's own captain)
-- ===========================================================================

create policy "team_members_select" on "team_members"
  for select using (
    exists (
      select 1 from teams t
      where t.id = team_members.team_id and public.can_view_competition(t.competition_id)
    )
  );--> statement-breakpoint
create policy "team_members_manage" on "team_members"
  for all to authenticated using (
    public.is_team_captain(team_id)
    or exists (
      select 1 from teams t
      where t.id = team_members.team_id and public.is_competition_admin(t.competition_id)
    )
  ) with check (
    public.is_team_captain(team_id)
    or exists (
      select 1 from teams t
      where t.id = team_members.team_id and public.is_competition_admin(t.competition_id)
    )
  );--> statement-breakpoint

-- ===========================================================================
-- matches  (captains can submit/update their own matches; admins manage all)
-- ===========================================================================

create policy "matches_select" on "matches"
  for select using (public.can_view_competition(competition_id) or public.is_match_captain(id));--> statement-breakpoint
create policy "matches_admin_all" on "matches"
  for all to authenticated using (public.is_competition_admin(competition_id)) with check (public.is_competition_admin(competition_id));--> statement-breakpoint
create policy "matches_captain_insert" on "matches"
  for insert to authenticated with check (
    public.is_team_captain(home_team_id) or public.is_team_captain(away_team_id)
  );--> statement-breakpoint
create policy "matches_captain_update" on "matches"
  for update to authenticated using (public.is_match_captain(id)) with check (
    public.is_team_captain(home_team_id) or public.is_team_captain(away_team_id)
  );--> statement-breakpoint

-- ===========================================================================
-- sets  (captain of either team in the match, or competition admin)
-- ===========================================================================

create policy "sets_select" on "sets"
  for select using (public.can_view_match(match_id));--> statement-breakpoint
create policy "sets_write" on "sets"
  for all to authenticated using (
    public.is_match_captain(match_id) or public.is_match_competition_admin(match_id)
  ) with check (
    public.is_match_captain(match_id) or public.is_match_competition_admin(match_id)
  );--> statement-breakpoint

-- ===========================================================================
-- match_confirmations  (captain records their own action; immutable log)
-- ===========================================================================

create policy "match_confirmations_select" on "match_confirmations"
  for select using (public.can_view_match(match_id));--> statement-breakpoint
create policy "match_confirmations_insert" on "match_confirmations"
  for insert to authenticated with check (
    public.is_match_captain(match_id) and captain_user_id = auth.uid()
  );--> statement-breakpoint

-- ===========================================================================
-- match_audit  (visible to match captains + competition admins; append-only)
-- ===========================================================================

create policy "match_audit_select" on "match_audit"
  for select using (
    public.is_match_captain(match_id) or public.is_match_competition_admin(match_id)
  );--> statement-breakpoint
create policy "match_audit_insert" on "match_audit"
  for insert to authenticated with check (
    public.is_match_captain(match_id) or public.is_match_competition_admin(match_id)
  );--> statement-breakpoint

-- ===========================================================================
-- standings_cache  (readable with the competition; written server-side only)
-- ===========================================================================

create policy "standings_cache_select" on "standings_cache"
  for select using (public.can_view_competition(competition_id));--> statement-breakpoint
create policy "standings_cache_admin_all" on "standings_cache"
  for all to authenticated using (public.is_competition_admin(competition_id)) with check (public.is_competition_admin(competition_id));
