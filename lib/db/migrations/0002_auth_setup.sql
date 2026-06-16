-- Phase 2: wire public.users to Supabase auth.users + org-creation helper.
--
--  1. handle_new_user(): on a new auth.users row, mirror it into public.users
--     (id, email, and display_name from signup metadata). `on conflict do
--     nothing` keeps it safe if a profile row already exists.
--  2. FK public.users.id -> auth.users(id) ON DELETE CASCADE. Added NOT VALID
--     so the existing seed rows (which predate auth.users) are grandfathered;
--     it is still enforced for all new inserts/updates. The seed now creates
--     real auth users (via the Admin API), so re-seeding satisfies the FK.
--  3. create_organization(): SECURITY DEFINER so the very first org_members
--     ("owner") row can be written before the caller is an org admin —
--     otherwise the org_members RLS check is a chicken-and-egg deadlock.

-- 1. auth.users -> public.users sync trigger ---------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
--> statement-breakpoint

drop trigger if exists on_auth_user_created on auth.users;
--> statement-breakpoint

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
--> statement-breakpoint

-- 2. FK public.users.id -> auth.users(id) (grandfather existing rows) --------

alter table "users"
  add constraint "users_id_auth_users_id_fk"
  foreign key ("id") references "auth"."users"("id")
  on delete cascade not valid;
--> statement-breakpoint

-- 3. atomic org creation (owner + first membership), bypassing RLS deadlock --

create or replace function public.create_organization(_name text, _slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _org_id uuid;
begin
  if _uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.organizations (slug, name, owner_user_id)
  values (_slug, _name, _uid)
  returning id into _org_id;

  insert into public.org_members (org_id, user_id, role)
  values (_org_id, _uid, 'owner');

  return _org_id;
end;
$$;
--> statement-breakpoint

grant execute on function public.create_organization(text, text) to authenticated;
