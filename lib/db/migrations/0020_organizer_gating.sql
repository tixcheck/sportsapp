-- Organizer-approval gating. Three tiers: general user (default), approved
-- organizer (can create orgs/competitions), platform admin (approves
-- organizers). organizer_status + is_platform_admin live on users but are NOT
-- user-writable — see the column-level GRANTs below.

-- 1. Access helpers ---------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from users where id = auth.uid()), false);
$$;
--> statement-breakpoint
create or replace function public.is_approved_organizer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select organizer_status = 'approved' from users where id = auth.uid()),
    false
  );
$$;
--> statement-breakpoint
grant execute on function public.is_platform_admin() to authenticated;
--> statement-breakpoint
grant execute on function public.is_approved_organizer() to authenticated;
--> statement-breakpoint

-- 2. The escalation guard: make organizer_status / is_platform_admin NOT
-- user-writable. RLS is row-level, so we use COLUMN-level privileges — revoke
-- blanket UPDATE and re-grant only the genuinely self-editable columns. Any
-- UPDATE touching the protected columns now fails with "permission denied for
-- column", regardless of RLS or what the client sends. The SECURITY DEFINER
-- rpcs below (and the secret-key role) run as the owner and are unaffected.
revoke update on public.users from authenticated, anon;
--> statement-breakpoint
grant update (
  display_name,
  avatar_url,
  phone,
  notify_results,
  notify_schedule_changes,
  notify_weekly
) on public.users to authenticated;
--> statement-breakpoint

-- 3. Request flow rpcs ------------------------------------------------------

-- A general user asks to become an organizer. Can ONLY move 'none' -> 'pending'
-- (never to 'approved'); records a request row.
create or replace function public.request_organizer(_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _status organizer_status;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  select organizer_status into _status from users where id = _uid;
  if _status is distinct from 'none' then
    raise exception 'request already submitted or you are already an organizer';
  end if;
  update users set organizer_status = 'pending' where id = _uid;
  insert into organizer_requests (user_id, status, note) values (_uid, 'pending', _note);
end;
$$;
--> statement-breakpoint
grant execute on function public.request_organizer(text) to authenticated;
--> statement-breakpoint

-- Platform admin approves/denies a pending request. Gated on is_platform_admin;
-- approve sets the user's organizer_status='approved'.
create or replace function public.decide_organizer_request(
  _request_id uuid,
  _approve boolean,
  _note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _req organizer_requests%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  select * into _req from organizer_requests where id = _request_id;
  if not found then raise exception 'request not found'; end if;
  if _req.status is distinct from 'pending' then
    raise exception 'request already decided';
  end if;

  update organizer_requests
    set status = case when _approve then 'approved' else 'denied' end,
        decided_at = now(),
        decided_by = _uid,
        note = coalesce(_note, note)
    where id = _request_id;

  update users
    set organizer_status = case when _approve then 'approved' else 'none' end
    where id = _req.user_id;
end;
$$;
--> statement-breakpoint
grant execute on function public.decide_organizer_request(uuid, boolean, text) to authenticated;
--> statement-breakpoint

-- 4. Gate org creation: only approved organizers. The rpc raises (SECURITY
-- DEFINER, so RLS wouldn't stop it); the insert policy backstops direct inserts.
create or replace function public.create_organization(_name text, _slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _org_id uuid;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  if not public.is_approved_organizer() then
    raise exception 'not an approved organizer';
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
drop policy if exists "organizations_insert_owner" on "organizations";
--> statement-breakpoint
create policy "organizations_insert_owner" on "organizations"
  for insert to authenticated
  with check (owner_user_id = auth.uid() and public.is_approved_organizer());
--> statement-breakpoint

-- 5. organizer_requests RLS: a user sees their own; the platform admin sees all.
-- Writes go only through the rpcs (no insert/update/delete policy).
alter table "organizer_requests" enable row level security;
--> statement-breakpoint
create policy "organizer_requests_select" on "organizer_requests"
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
--> statement-breakpoint

-- 6. Grandfather everyone currently doing organizer work (org owners + any
-- org_members staff role) so they aren't locked out. Plain team
-- captains/players (team_members) are NOT org_members, so they stay 'none'.
update users u set organizer_status = 'approved'
where exists (select 1 from organizations o where o.owner_user_id = u.id)
   or exists (
     select 1 from org_members m
     where m.user_id = u.id and m.role in ('owner', 'admin', 'organizer')
   );
--> statement-breakpoint

-- 7. Seed the FIRST platform admin — the first admin can't self-approve, so it
-- must be set directly here. mark@example.com is a placeholder for now; set the
-- real platform-admin account at launch. No-op if that users row doesn't exist
-- yet (e.g. fresh prod before the admin has signed up).
update users set is_platform_admin = true where email = 'mark@example.com';