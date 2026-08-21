-- Per-tier registration caps.
--
-- `league_settings.max_teams` caps a competition. A tiered league also needs a
-- cap per tier: courts are split between tiers, so "six teams total" and "two
-- per tier" are different limits and both can bind. The column arrived in
-- migration 0079; this teaches `register_team` to enforce it.
--
-- Checked INSIDE the function that inserts, exactly as the competition total
-- is, so two captains racing for a tier's last spot cannot both take it. The
-- check sits after the division-exists guard so an unknown tier is still
-- reported as unknown rather than as full. Withdrawn teams free their spot.
--
-- The rest of the body is reproduced verbatim from the live definition so that
-- nothing about payment gating, invites or display-name seeding changes by
-- accident.

CREATE OR REPLACE FUNCTION public.register_team(_competition_id uuid, _division_id uuid, _team_name text, _player_emails jsonb, _payment_mode registration_payment_kind DEFAULT 'team_full'::registration_payment_kind)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  _tier_max integer;
  _tier_teams integer;
  _tier_name text;
  _fee_cents integer;
  _payment_required boolean;
  _status team_status := 'active';
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
    case when c.type = 'tournament' then ts.max_teams else ls.max_teams end,
    coalesce(cps.registration_fee_cents, 0),
    coalesce(cps.payment_required, false)
  into _visibility, _type, _deadline, _reg_open, _max_teams,
       _fee_cents, _payment_required
  from competitions c
  left join tournament_settings ts on ts.competition_id = c.id
  left join league_settings ls on ls.competition_id = c.id
  left join competition_payment_settings cps on cps.competition_id = c.id
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

  -- Per-tier capacity. A tiered league is limited by its courts per tier, not
  -- only by its total: six courts split three ways caps each tier at two, and
  -- the competition total can be nowhere near full while a tier is. Counted in
  -- the same function as the insert for the same reason as the total above --
  -- two captains picking the last spot in one tier cannot both get it.
  if _division_id is not null then
    select d.max_teams, d.name into _tier_max, _tier_name
      from divisions d where d.id = _division_id;

    if _tier_max is not null then
      select count(*) into _tier_teams
        from teams t
       where t.competition_id = _competition_id
         and t.division_id = _division_id
         and t.status <> 'withdrawn';

      if _tier_teams >= _tier_max then
        raise exception '% is full -- all % spots in it have been taken.',
          _tier_name, _tier_max;
      end if;
    end if;
  end if;

  select email into _email from users where id = _uid;

  -- A priced event that requires payment admits the team as UNCONFIRMED. The
  -- row has to exist -- a split fee needs a roster to divide across, and a
  -- charge needs something to attach to -- but it is not an entrant until the
  -- fee is covered. Pools, schedules and standings all exclude this status.
  if _payment_required and _fee_cents > 0 then
    _status := 'pending_payment';
  end if;

  insert into teams (competition_id, division_id, name, captain_user_id, status, payment_mode)
  values (_competition_id, _division_id, _team_name, _uid, _status,
          case when _status = 'pending_payment' then _payment_mode else null end)
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
$function$;
