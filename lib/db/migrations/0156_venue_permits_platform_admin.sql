-- Platform admins can see and manage an organization's gym permits.
--
-- 0155 made permits readable by the org's MEMBERS and writable by its admins.
-- The platform owner set BVL's up and is not a BVL member — so the "Gym
-- permits" card he had just loaded stayed empty for him (2026-10-07). Org
-- settings elsewhere (brand colours, waivers) already admit platform staff
-- through `can_manage_org`; permits now do the same.

drop policy if exists "venue_permits_select" on "venue_permits";
--> statement-breakpoint
create policy "venue_permits_select" on "venue_permits"
  for select to authenticated
  using (public.is_org_member("org_id") or public.is_platform_admin());
--> statement-breakpoint
drop policy if exists "venue_permits_write" on "venue_permits";
--> statement-breakpoint
create policy "venue_permits_write" on "venue_permits"
  for all to authenticated
  using (public.can_manage_org("org_id"))
  with check (public.can_manage_org("org_id"));
--> statement-breakpoint

drop policy if exists "venue_permit_dates_select" on "venue_permit_dates";
--> statement-breakpoint
create policy "venue_permit_dates_select" on "venue_permit_dates"
  for select to authenticated using (
    exists (select 1 from venue_permits p where p.id = permit_id
             and (public.is_org_member(p.org_id) or public.is_platform_admin()))
  );
--> statement-breakpoint
drop policy if exists "venue_permit_dates_write" on "venue_permit_dates";
--> statement-breakpoint
create policy "venue_permit_dates_write" on "venue_permit_dates"
  for all to authenticated
  using (exists (select 1 from venue_permits p where p.id = permit_id and public.can_manage_org(p.org_id)))
  with check (exists (select 1 from venue_permits p where p.id = permit_id and public.can_manage_org(p.org_id)));
