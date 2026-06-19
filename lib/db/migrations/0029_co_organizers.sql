
  -- Owner/admin of the competition's org (today's is_competition_admin behavior).
  -- Gates granting + the destructive carve-outs. Never reads competition_admins.
  create or replace function public.is_competition_org_admin(_competition_id uuid)
  returns boolean language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from competitions c
      where c.id = _competition_id and public.is_org_admin(c.org_id)
    );
  $$;
  --> statement-breakpoint
  -- Competition admin = org owner/admin OR an org 'organizer' member OR a
  -- per-competition grant. Every existing is_competition_admin call site inherits.
  create or replace function public.is_competition_admin(_competition_id uuid)
  returns boolean language sql stable security definer set search_path = public as $$
    select
      public.is_competition_org_admin(_competition_id)
      or exists (
        select 1 from competitions c
        join org_members m on m.org_id = c.org_id
        where c.id = _competition_id and m.user_id = auth.uid() and m.role = 'organizer'
      )
      or exists (
        select 1 from competition_admins ca
        where ca.competition_id = _competition_id and ca.user_id = auth.uid()
      );
  $$;
  --> statement-breakpoint
  -- Fix the audited bypass: competitions was gated by is_org_admin. Split it.
  drop policy if exists "competitions_admin_all" on "competitions";
  --> statement-breakpoint
  create policy "competitions_insert_admin" on "competitions"
    for insert to authenticated with check (public.is_org_admin(org_id));
  --> statement-breakpoint
  create policy "competitions_update_admin" on "competitions"
    for update to authenticated
    using (public.is_competition_admin(id)) with check (public.is_competition_admin(id));
  --> statement-breakpoint
  create policy "competitions_delete_admin" on "competitions"
    for delete to authenticated using (public.is_competition_org_admin(id));
  --> statement-breakpoint
  -- Tighten org delete to OWNER only (was owner/admin).
  drop policy if exists "organizations_delete_admin" on "organizations";
  --> statement-breakpoint
  create policy "organizations_delete_owner" on "organizations"
    for delete to authenticated using (owner_user_id = auth.uid());
  --> statement-breakpoint
  -- competition_admins: self or org owner/admin may read; ONLY org owner/admin
  -- (is_competition_org_admin, NOT is_competition_admin) may manage — the
  -- escalation guard so a co-organizer can never grant themselves or others.
  alter table "competition_admins" enable row level security;
  --> statement-breakpoint
  create policy "competition_admins_select" on "competition_admins"
    for select to authenticated
    using (user_id = auth.uid() or public.is_competition_org_admin(competition_id));
  --> statement-breakpoint
  create policy "competition_admins_manage" on "competition_admins"
    for all to authenticated
    using (public.is_competition_org_admin(competition_id))
    with check (public.is_competition_org_admin(competition_id));
  --> statement-breakpoint
  -- Grant/revoke rpcs: assert caller is org owner/admin, resolve by email
  -- (v1: existing accounts only), write the grant.
  create or replace function public.grant_org_organizer(_org_id uuid, _email text)
  returns uuid language plpgsql security definer set search_path = public as $$
  declare _uid uuid;
  begin
    if not public.is_org_admin(_org_id) then raise exception 'not authorized'; end if;
    select id into _uid from users where lower(email) = lower(_email);
    if _uid is null then raise exception 'no account with that email'; end if;
    insert into org_members (org_id, user_id, role) values (_org_id, _uid, 'organizer')
    on conflict (org_id, user_id) do nothing;  -- keep any existing higher role
    return _uid;
  end;
  $$;
  --> statement-breakpoint
  create or replace function public.revoke_org_organizer(_org_id uuid, _user_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
  begin
    if not public.is_org_admin(_org_id) then raise exception 'not authorized'; end if;
    delete from org_members where org_id = _org_id and user_id = _user_id and role = 'organizer';
  end;
  $$;
  --> statement-breakpoint
  create or replace function public.grant_competition_admin(_competition_id uuid, _email text)
  returns uuid language plpgsql security definer set search_path = public as $$
  declare _uid uuid;
  begin
    if not public.is_competition_org_admin(_competition_id) then raise exception 'not authorized'; end if;
    select id into _uid from users where lower(email) = lower(_email);
    if _uid is null then raise exception 'no account with that email'; end if;
    insert into competition_admins (competition_id, user_id, granted_by_user_id)
    values (_competition_id, _uid, auth.uid())
    on conflict (competition_id, user_id) do nothing;
    return _uid;
  end;
  $$;
  --> statement-breakpoint
  create or replace function public.revoke_competition_admin(_competition_id uuid, _user_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
  begin
    if not public.is_competition_org_admin(_competition_id) then raise exception 'not authorized'; end if;
    delete from competition_admins where competition_id = _competition_id and user_id = _user_id;
  end;
  $$;
  --> statement-breakpoint
  grant execute on function public.is_competition_org_admin(uuid) to authenticated;
  --> statement-breakpoint
  grant execute on function public.grant_org_organizer(uuid, text) to authenticated;
  --> statement-breakpoint
  grant execute on function public.revoke_org_organizer(uuid, uuid) to authenticated;
  --> statement-breakpoint
  grant execute on function public.grant_competition_admin(uuid, text) to authenticated;
  --> statement-breakpoint
  grant execute on function public.revoke_competition_admin(uuid, uuid) to authenticated;