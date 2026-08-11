-- Invited people were locked out of their own teams.
--
-- Invites carry a 14-day expiry. my_pending_invites() never filtered on it, so
-- the dashboard listed every pending invite with a "Claim" button — but
-- claim_team() and accept_pending_invites() both required expires_at > now(),
-- so the button failed with "invite is invalid or has expired" and auto-accept
-- silently skipped them. At the time of writing, 70 of 96 pending invites in
-- production were in that state.
--
-- The fix is to be clear about what the expiry is FOR. It guards a token that
-- has leaked or been forwarded — someone holding a link they shouldn't. It was
-- never meant to lock out the person the invite was addressed to. When the
-- signed-in user's email matches the invite, auth has already proven who they
-- are, and the token adds nothing; the expiry should not apply.
--
-- So: email-matched paths ignore expiry entirely, and a token whose email does
-- NOT match the signed-in user still expires as before.

-- 1. Auto-accept: only ever matches the caller's own email, so it is always the
--    rightful owner. The expiry check had no protective value here at all.
create or replace function public.accept_pending_invites()
returns integer language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _email text;
  _invite team_invites%rowtype;
  _count int := 0;
begin
  if _uid is null then return 0; end if;
  select lower(u.email) into _email from users u where u.id = _uid;
  if _email is null then return 0; end if;

  for _invite in
    select * from team_invites
    where status = 'pending'
      and lower(email) = _email
  loop
    if _invite.role = 'captain' then
      update teams set captain_user_id = _uid where id = _invite.team_id;
      insert into team_members (team_id, user_id, role)
      values (_invite.team_id, _uid, 'captain')
      on conflict (team_id, user_id) do update set role = 'captain';
    else
      insert into team_members (team_id, user_id, role)
      values (_invite.team_id, _uid, 'player')
      on conflict (team_id, user_id) do nothing;
    end if;
    update team_invites set status = 'accepted', accepted_by_user_id = _uid
    where id = _invite.id;
    _count := _count + 1;
  end loop;
  return _count;
end;
$$;
--> statement-breakpoint

-- 2. Claim by token: expiry still applies to a link held by someone whose email
--    doesn't match, which is exactly the leaked-link case it exists for.
create or replace function public.claim_team(_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _email text;
  _invite team_invites%rowtype;
begin
  if _uid is null then
    raise exception 'not authenticated';
  end if;

  select * into _invite
  from team_invites
  where token = _token
    and status = 'pending'
  limit 1;

  if not found then
    raise exception 'invite is invalid or has expired';
  end if;

  select lower(u.email) into _email from users u where u.id = _uid;

  if _invite.expires_at is not null
     and _invite.expires_at <= now()
     and lower(_invite.email) is distinct from _email then
    raise exception 'invite is invalid or has expired';
  end if;

  if _invite.role = 'captain' then
    update teams set captain_user_id = _uid where id = _invite.team_id;
    insert into team_members (team_id, user_id, role)
    values (_invite.team_id, _uid, 'captain')
    on conflict (team_id, user_id) do update set role = 'captain';
  else
    insert into team_members (team_id, user_id, role)
    values (_invite.team_id, _uid, 'player')
    on conflict (team_id, user_id) do nothing;
  end if;

  update team_invites
  set status = 'accepted', accepted_by_user_id = _uid
  where id = _invite.id;

  return _invite.team_id;
end;
$$;
--> statement-breakpoint

-- 3. Organizer-side autolink: matches an invitee who already has an account, by
--    email. Same rightful-owner reasoning as auto-accept.
create or replace function public.autolink_team_invites(_team_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  _comp uuid;
  _invite team_invites%rowtype;
  _target uuid;
  _count int := 0;
begin
  select competition_id into _comp from teams where id = _team_id;
  if _comp is null then return 0; end if;
  if not public.is_competition_admin(_comp) then
    raise exception 'not authorized';
  end if;

  for _invite in
    select * from team_invites
    where team_id = _team_id and status = 'pending'
  loop
    select u.id into _target from users u
    where lower(u.email) = lower(_invite.email)
    limit 1;
    if _target is not null then
      if _invite.role = 'captain' then
        update teams set captain_user_id = _target where id = _invite.team_id;
        insert into team_members (team_id, user_id, role)
        values (_invite.team_id, _target, 'captain')
        on conflict (team_id, user_id) do update set role = 'captain';
      else
        insert into team_members (team_id, user_id, role)
        values (_invite.team_id, _target, 'player')
        on conflict (team_id, user_id) do nothing;
      end if;
      update team_invites set status = 'accepted', accepted_by_user_id = _target
      where id = _invite.id;
      _count := _count + 1;
    end if;
  end loop;
  return _count;
end;
$$;
