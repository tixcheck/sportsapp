-- Organizer-uploaded images: event banners and organization logos.
--
-- Until now `competitions.banner_url` and `organizations.logo_url` could only
-- hold a link to something the organizer hosted elsewhere, which most of them
-- have no way to do. This gives them somewhere to put the file.
--
-- The path is `<org_id>/<purpose>-<random>.<ext>` and the FIRST segment is
-- load-bearing: the write policy reads it back to decide whether the caller may
-- store here. That is why `lib/uploads/image.ts` refuses to build a path whose
-- first segment isn't a UUID, and why the helper below returns NULL rather than
-- raising on a malformed one — a policy that throws is a policy that can be
-- probed for information.
--
-- Type and size are constrained by the bucket itself, not only by the client.
-- The browser checks are for a good error message; these are the enforcement.
-- SVG is excluded on purpose: it is a document that can carry <script>, and
-- while Supabase serves it from its own origin rather than ours, it would still
-- be a script we hosted and handed to a player.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-images',
  'event-images',
  true,                                   -- banners render on public pages
  5242880,                                -- 5 MB, matching MAX_IMAGE_BYTES
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
--> statement-breakpoint

/**
 * The organization a storage object belongs to, or NULL if the path is not one
 * of ours. Mirrors `orgFromImagePath` in lib/uploads/image.ts.
 *
 * Returns NULL instead of casting blindly: `'../x'::uuid` raises, and a policy
 * that raises behaves differently from one that denies, which is a difference
 * worth not exposing.
 */
create or replace function public.storage_object_org(_name text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(_name, '/', 1) ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(_name, '/', 1)::uuid
    else null
  end;
$$;
--> statement-breakpoint

comment on function public.storage_object_org(text) is
  'First path segment of an event-images object as a uuid, or NULL. Used by the storage RLS policies.';
--> statement-breakpoint

-- Anyone may read: these are banners and logos on pages with no login.
drop policy if exists "event_images_read" on storage.objects;
--> statement-breakpoint
create policy "event_images_read" on storage.objects
  for select
  using (bucket_id = 'event-images');
--> statement-breakpoint

-- Only an admin of the organization named by the first path segment may write
-- into it. This is the whole authorization story for uploads.
drop policy if exists "event_images_insert" on storage.objects;
--> statement-breakpoint
create policy "event_images_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-images'
    and public.storage_object_org(name) is not null
    and public.is_org_admin(public.storage_object_org(name))
  );
--> statement-breakpoint

drop policy if exists "event_images_update" on storage.objects;
--> statement-breakpoint
create policy "event_images_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'event-images'
    and public.is_org_admin(public.storage_object_org(name))
  )
  with check (
    bucket_id = 'event-images'
    and public.is_org_admin(public.storage_object_org(name))
  );
--> statement-breakpoint

-- Replacing a banner should not leave the old file served forever.
drop policy if exists "event_images_delete" on storage.objects;
--> statement-breakpoint
create policy "event_images_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'event-images'
    and public.is_org_admin(public.storage_object_org(name))
  );
