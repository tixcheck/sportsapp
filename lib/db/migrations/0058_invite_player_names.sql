-- Player names on registration (readability).
--
-- Teams registering can now give each player a readable name alongside their
-- email. The name lives on team_invites so the roster shows "Bradley Walsh"
-- instead of a bare address while the invite is pending, and — on claim — seeds
-- the joiner's display name if they don't already have one, so it sticks.
--
-- register_team's players payload changes from a plain email array to
-- [{ name, email }] objects (plain strings are still accepted for safety), and
-- it seeds the registrant's own display name from their captain entry. Because
-- the last argument keeps its jsonb type + parameter name, this is a drop-in
-- CREATE OR REPLACE — no call-site signature change.

alter table "team_invites" add column if not exists "name" text;--> statement-breakpoint

create or replace function public.register_team(
  _competition_id uuid,
  _division_id uuid,
  _team_name text,
  _player_emails jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _email text;
  _team_id uuid;
  _deadline timestamptz;
  _visibility competition_visibility;
  _type competition_type;
  _reg_open boolean;
  _elem jsonb;
  _pe text;
  _pname text;
  _target uuid;
  _token text;
begin
  if _uid is null then
    raise exception 'You must be signed in to register.';
  end if;

  select
    c.visibility,
    c.type,
    case when c.type = 'tournament' then ts.registration_deadline
         else ls.registration_deadline end,
    case when c.type = 'tournament' then (c.status = 'open')
         else coalesce(ls.registration_open, false) end
  into _visibility, _type, _deadline, _reg_open
  from competitions c
  left join tournament_settings ts on ts.competition_id = c.id
  left join league_settings ls on ls.competition_id = c.id
  where c.id = _competition_id;

  if _type is null then
    raise exception 'Competition not found.';
  end if;
  if _visibility is distinct from 'public' then
    raise exception 'Registration is not open for this competition.';
  end if;
  if not coalesce(_reg_open, false) then
    raise exception 'Registration is not open for this competition.';
  end if;
  if _deadline is not null and _deadline < now() then
    raise exception 'The registration deadline has passed.';
  end if;

  if _division_id is not null and not exists (
    select 1 from divisions d
    where d.id = _division_id and d.competition_id = _competition_id
  ) then
    raise exception 'Invalid division.';
  end if;

  select email into _email from users where id = _uid;

  insert into teams (competition_id, division_id, name, captain_user_id)
  values (_competition_id, _division_id, _team_name, _uid)
  returning id into _team_id;

  insert into team_members (team_id, user_id, role)
  values (_team_id, _uid, 'captain')
  on conflict (team_id, user_id) do update set role = 'captain';

  insert into team_registrations (team_id, competition_id, contact_email, player_emails)
  values (_team_id, _competition_id, coalesce(_email, ''), _player_emails);

  -- Invite the listed teammates. Each element is either { name, email } or a
  -- plain email string. Skip the registrant's own email (already the captain);
  -- if their entry carries a name, seed their display name when it's blank.
  for _elem in select value from jsonb_array_elements(_player_emails)
  loop
    if jsonb_typeof(_elem) = 'string' then
      _pe := _elem #>> '{}';
      _pname := null;
    else
      _pe := _elem ->> 'email';
      _pname := nullif(btrim(coalesce(_elem ->> 'name', '')), '');
    end if;

    if _pe is null or btrim(_pe) = '' then continue; end if;

    if _email is not null and lower(btrim(_pe)) = lower(_email) then
      if _pname is not null then
        update users set display_name = _pname
        where id = _uid and coalesce(btrim(display_name), '') = '';
      end if;
      continue;
    end if;

    _token := replace(gen_random_uuid()::text, '-', '')
           || replace(gen_random_uuid()::text, '-', '');
    insert into team_invites (team_id, email, name, token, role, invited_by_user_id, expires_at)
    values (_team_id, btrim(_pe), _pname, _token, 'player', _uid, now() + interval '30 days');

    select u.id into _target from users u
    where lower(u.email) = lower(btrim(_pe)) limit 1;
    if _target is not null then
      insert into team_members (team_id, user_id, role)
      values (_team_id, _target, 'player')
      on conflict (team_id, user_id) do nothing;
      if _pname is not null then
        update users set display_name = _pname
        where id = _target and coalesce(btrim(display_name), '') = '';
      end if;
      update team_invites set status = 'accepted', accepted_by_user_id = _target
      where team_id = _team_id and lower(email) = lower(btrim(_pe)) and status = 'pending';
    end if;
  end loop;

  return _team_id;
end;
$$;--> statement-breakpoint

grant execute on function public.register_team(uuid, uuid, text, jsonb) to authenticated;--> statement-breakpoint

-- When an invited teammate joins later, carry the invited name onto their
-- profile if they haven't set a display name — so the readable name persists.
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
    if _invite.name is not null and btrim(_invite.name) <> '' then
      update users set display_name = _invite.name
      where id = _uid and coalesce(btrim(display_name), '') = '';
    end if;
    update team_invites set status = 'accepted', accepted_by_user_id = _uid
    where id = _invite.id;
    _count := _count + 1;
  end loop;
  return _count;
end;
$$;--> statement-breakpoint

grant execute on function public.accept_pending_invites() to authenticated;
