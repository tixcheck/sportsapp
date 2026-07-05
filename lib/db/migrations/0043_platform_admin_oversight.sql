-- Platform-admin oversight. A platform admin can VIEW every competition and act
-- as a competition admin on any of them (fix scores/schedules/settings) so they
-- can see what organizers are creating and correct it. This does NOT grant
-- org-level power — renaming/deleting an org and managing org membership stay
-- owner/admin only (is_org_admin is unchanged). Organizations are already
-- world-readable (organizations_select using(true)), so no change is needed
-- there. We widen the two read/write helpers to include is_platform_admin().

create or replace function public.can_view_competition(_competition_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.is_platform_admin()
    or exists (
      select 1 from competitions c
      where c.id = _competition_id
        and (
          c.visibility = 'public'
          or public.is_org_member(c.org_id)
          or public.is_competition_admin(c.id)
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
  select
    public.is_platform_admin()
    or public.is_competition_org_admin(_competition_id)
    or exists (
      select 1 from competitions c
      join org_members m on m.org_id = c.org_id
      where c.id = _competition_id
        and m.user_id = auth.uid()
        and m.role = 'organizer'
    )
    or exists (
      select 1 from competition_admins ca
      where ca.competition_id = _competition_id and ca.user_id = auth.uid()
    );
$$;
--> statement-breakpoint
-- Let a platform admin read user rows (to show who owns each org / runs each
-- competition on the oversight dashboard). Others stay self/shared-only.
drop policy if exists "users_select" on "users";
--> statement-breakpoint
create policy "users_select" on "users"
  for select using (
    id = auth.uid()
    or public.shares_context_with(id)
    or public.is_platform_admin()
  );
--> statement-breakpoint
-- Make the app owner a platform admin (idempotent).
update users set is_platform_admin = true
where lower(email) = 'k.gautamraj@gmail.com';
