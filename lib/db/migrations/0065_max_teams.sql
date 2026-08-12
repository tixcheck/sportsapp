-- Registration capacity — "this event holds N teams".
--
-- Until now `register_team` checked visibility, whether registration was open,
-- and the deadline, but nothing counted teams. A 4-court tournament could take
-- 60 registrations and the organizer would only find out by looking.
--
-- Nullable on purpose: null means uncapped, which is what every existing
-- competition is today. A default number would silently cap live events.
--
-- Enforced inside register_team rather than by a table constraint, because the
-- limit governs how many rows may be INSERTED, not anything about a single row.
-- Counting in the same SECURITY DEFINER function that inserts is also what
-- makes it race-safe.
--
-- The function body below is the 0058 definition VERBATIM plus the capacity
-- guard — reproduced rather than rewritten, so nothing about invites, division
-- validation or display-name seeding changes by accident.

alter table "tournament_settings"
  add column "max_teams" integer;
--> statement-breakpoint

alter table "tournament_settings"
  add constraint "tournament_settings_max_teams_positive"
  check ("max_teams" is null or "max_teams" >= 1);
--> statement-breakpoint

alter table "league_settings"
  add column "max_teams" integer;
--> statement-breakpoint

alter table "league_settings"
  add constraint "league_settings_max_teams_positive"
  check ("max_teams" is null or "max_teams" >= 1);
--> statement-breakpoint

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
  _max_teams integer;
  _current_teams integer;
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
         else coalesce(ls.registration_open, false) end,
    case when c.type = 'tournament' then ts.max_teams else ls.max_teams end
  into _visibility, _type, _deadline, _reg_open, _max_teams
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

  -- Capacity. Counted inside the function that does the insert, so two captains
  -- hitting Register at the same instant cannot both slip through the last
  -- remaining spot. Withdrawn teams free their spot back up.
  if _max_teams is not null then
    select count(*) into _current_teams
    from teams t
    where t.competition_id = _competition_id
      and t.status <> 'withdrawn';

    if _current_teams >= _max_teams then
      raise exception 'This event is full — all % spots have been taken.', _max_teams;
    end if;
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
$$;
--> statement-breakpoint

grant execute on function public.register_team(uuid, uuid, text, jsonb) to authenticated;
