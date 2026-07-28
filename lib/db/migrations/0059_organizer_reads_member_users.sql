-- Organizers couldn't see their own players' names/emails.
--
-- getTeamRosters reads the users table (RLS-gated) for joined members' display
-- names + emails. users_select only allowed self, shares_context_with (same org
-- or same team), or platform admin. So the app OWNER (a platform admin) saw
-- every name, but a co-organizer — a competition admin who isn't in the players'
-- org and isn't on their team — saw the "Member —" fallback for every joined
-- member.
--
-- Fix: a competition's admins may read the user rows of members on that
-- competition's teams. This is the same access the owner already has, and
-- exactly what an organizer needs to manage their roster.

create or replace function public.administers_team_member(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from team_members tm
    join teams t on t.id = tm.team_id
    where tm.user_id = _user_id
      and public.is_competition_admin(t.competition_id)
  );
$$;--> statement-breakpoint

grant execute on function public.administers_team_member(uuid) to authenticated;--> statement-breakpoint

drop policy if exists "users_select" on "users";--> statement-breakpoint

create policy "users_select" on "users"
  for select using (
    id = auth.uid()
    or public.shares_context_with(id)
    or public.is_platform_admin()
    or public.administers_team_member(id)
  );
