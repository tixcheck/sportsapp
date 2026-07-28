-- Slice 2: public league registration.
--
-- 1. league_settings gains registration_open + registration_deadline (mirrors
--    tournament_settings). Independent of visibility so an organizer can publish
--    a league's schedule with sign-ups closed.
-- 2. register_team is generalized to leagues (was tournament-only) and now
--    INVITES the listed teammates — previously their emails were stored on the
--    registration record but never turned into team_invites, so co-registered
--    players never saw the league or could enter scores. It creates a pending
--    'player' invite per non-captain email and links any that already have an
--    account (the rest are picked up by accept_pending_invites on next login).

alter table "league_settings"
  add column if not exists "registration_open" boolean not null default false;--> statement-breakpoint
alter table "league_settings"
  add column if not exists "registration_deadline" timestamptz;--> statement-breakpoint

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
  _pe text;
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

  -- Division (when provided) must belong to this competition.
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

  -- Invite the listed teammates (skip the registrant's own email — already the
  -- captain). Each gets a pending 'player' invite; if they already have an
  -- account, link them straight away.
  for _pe in select value from jsonb_array_elements_text(_player_emails)
  loop
    if _pe is null or btrim(_pe) = '' then continue; end if;
    if _email is not null and lower(btrim(_pe)) = lower(_email) then continue; end if;

    _token := replace(gen_random_uuid()::text, '-', '')
           || replace(gen_random_uuid()::text, '-', '');
    insert into team_invites (team_id, email, token, role, invited_by_user_id, expires_at)
    values (_team_id, btrim(_pe), _token, 'player', _uid, now() + interval '30 days');

    select u.id into _target from users u
    where lower(u.email) = lower(btrim(_pe)) limit 1;
    if _target is not null then
      insert into team_members (team_id, user_id, role)
      values (_team_id, _target, 'player')
      on conflict (team_id, user_id) do nothing;
      update team_invites set status = 'accepted', accepted_by_user_id = _target
      where team_id = _team_id and lower(email) = lower(btrim(_pe)) and status = 'pending';
    end if;
  end loop;

  return _team_id;
end;
$$;--> statement-breakpoint

grant execute on function public.register_team(uuid, uuid, text, jsonb) to authenticated;
