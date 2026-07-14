-- Auto-accept team invites — an invited person no longer clicks "accept".
--
-- accept_pending_invites() links the signed-in user to every team invited to
-- their email. Run on dashboard load, so a brand-new sign-up sees their leagues
-- and tournaments immediately.
--
-- autolink_team_invites() lets an organizer's add-team flow link an invitee who
-- ALREADY has an account, right away (their profile picks it up without waiting
-- for them to log in again). Both mirror claim_team's captain/player logic.

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
      and (expires_at is null or expires_at > now())
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
grant execute on function public.accept_pending_invites() to authenticated;
--> statement-breakpoint

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
      and (expires_at is null or expires_at > now())
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
--> statement-breakpoint
grant execute on function public.autolink_team_invites(uuid) to authenticated;
