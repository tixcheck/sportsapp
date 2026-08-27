-- Let the platform admin manage an organization they are not a member of.
--
-- `is_org_admin` is deliberately narrow: it answers "is this user in
-- org_members with owner or admin role", and a number of policies want exactly
-- that question. The composite checks in this schema layer the platform admin
-- on top — `is_competition_admin` literally begins with
-- `public.is_platform_admin() or ...`.
--
-- 0087 used the narrow one for the event-images policies, so the platform admin
-- was refused uploads for the three organizations they don't belong to. This
-- adds the composite the same way the rest of the schema builds one, rather
-- than widening `is_org_admin` — that function is used by policies where
-- "member of this org" is the intended question, and quietly turning it into
-- "member, or the platform admin" would grant sweeping write access in places
-- nobody reviewed for it.

create or replace function public.can_manage_org(_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin() or public.is_org_admin(_org_id);
$$;
--> statement-breakpoint

comment on function public.can_manage_org(uuid) is
  'Org admin OR platform admin. Use where an operation should be available to support/staff as well as the organization''s own admins.';
--> statement-breakpoint

revoke all on function public.can_manage_org(uuid) from public;
--> statement-breakpoint
grant execute on function public.can_manage_org(uuid) to authenticated;
--> statement-breakpoint

-- Repoint the event-images write policies. Read is unchanged (public).
drop policy if exists "event_images_insert" on storage.objects;
--> statement-breakpoint
create policy "event_images_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-images'
    and public.storage_object_org(name) is not null
    and public.can_manage_org(public.storage_object_org(name))
  );
--> statement-breakpoint

drop policy if exists "event_images_update" on storage.objects;
--> statement-breakpoint
create policy "event_images_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'event-images'
    and public.can_manage_org(public.storage_object_org(name))
  )
  with check (
    bucket_id = 'event-images'
    and public.can_manage_org(public.storage_object_org(name))
  );
--> statement-breakpoint

drop policy if exists "event_images_delete" on storage.objects;
--> statement-breakpoint
create policy "event_images_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'event-images'
    and public.can_manage_org(public.storage_object_org(name))
  );
