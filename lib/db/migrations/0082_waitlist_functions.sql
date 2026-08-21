-- Waitlist: joining, offering, claiming, expiring.
--
-- The queue exists because a spot is contested, so every function here is about
-- not double-selling one. Capacity is asked of `competition_spots_taken`
-- (migration 0081) in every path, and that counts an unexpired OFFER as
-- occupied.
--
-- `register_team` is redefined for two reasons, and reproduced verbatim
-- otherwise so nothing about invites, payment gating or display-name seeding
-- changes by accident:
--
--   1. Its two capacity counts now go through competition_spots_taken, so an
--      offer holds its spot against a walk-up registration. A team told a spot
--      is theirs must not lose it to someone refreshing the form.
--   2. A captain holding a live offer may register even if registration has
--      since closed or the deadline has passed. The spot was promised to them;
--      a door closing while they made up their mind must not retract it.

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
  _my_offer uuid;
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
  -- A live waitlist offer is a promise already made: the spot was held for
  -- this captain and they are claiming it. Closing registration afterwards, or
  -- a deadline passing while they decided, must not retract it.
  select w.id into _my_offer
    from waitlist_entries w
   where w.competition_id = _competition_id
     and w.captain_user_id = _uid
     and w.status = 'offered'
     and w.offer_expires_at > now()
   limit 1;

  if _my_offer is null then
    if not coalesce(_reg_open, false) then
      raise exception 'Registration is not open for this competition.';
    end if;
    if _deadline is not null and _deadline < now() then
      raise exception 'The registration deadline has passed.';
    end if;
  end if;

  -- Capacity. Counted inside the function that does the insert, so two captains
  -- hitting Register at the same instant cannot both slip through the last
  -- remaining spot. Withdrawn teams free their spot back up.
  if _max_teams is not null then
    -- Counted by competition_spots_taken so an unexpired offer occupies a
    -- spot: a team told the spot is theirs must not lose it to a walk-up.
    _current_teams := public.competition_spots_taken(
      _competition_id, null, _my_offer);

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
      _tier_teams := public.competition_spots_taken(
        _competition_id, _division_id, _my_offer);

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
--> statement-breakpoint

/**
 * Join the queue for a competition, or one of its tiers.
 *
 * Refuses when there is room — a queue nobody needs to be in would leave teams
 * waiting beside an open registration form. No payment is taken: a place in a
 * queue is not an entry, and charging for one that may never be offered is
 * indefensible.
 */
create or replace function public.join_waitlist(
  _competition_id uuid,
  _division_id uuid,
  _team_name text,
  _contact_email text,
  _player_emails jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _visibility competition_visibility;
  _id uuid;
begin
  if _uid is null then
    raise exception 'You need to be signed in to join the waitlist.';
  end if;

  select c.visibility into _visibility
    from competitions c where c.id = _competition_id;
  if not found then
    raise exception 'Competition not found.';
  end if;
  if _visibility is distinct from 'public' then
    raise exception 'Registration is not open for this competition.';
  end if;

  if _division_id is not null and not exists (
    select 1 from divisions d
     where d.id = _division_id and d.competition_id = _competition_id
  ) then
    raise exception 'Invalid division.';
  end if;

  if not public.competition_is_full(_competition_id, _division_id) then
    raise exception 'There are still spots left, so you can register instead.';
  end if;

  insert into waitlist_entries
    (competition_id, division_id, team_name, captain_user_id, contact_email,
     player_emails)
  values
    (_competition_id, _division_id, btrim(_team_name), _uid,
     lower(btrim(_contact_email)), coalesce(_player_emails, '[]'::jsonb))
  returning id into _id;

  return _id;
end;
$$;
--> statement-breakpoint

revoke all on function public.join_waitlist(uuid, uuid, text, text, jsonb) from public;
--> statement-breakpoint
grant execute on function public.join_waitlist(uuid, uuid, text, text, jsonb) to authenticated;
--> statement-breakpoint

/**
 * Offer a freed spot to whoever is first in line, if there is room for them.
 *
 * Returns the entry so the caller can email it, or null when the queue is empty
 * or the spot is already gone. Safe to call whenever a team leaves — deciding
 * there is nothing to do is the common case.
 */
create or replace function public.offer_next_waitlist_spot(
  _competition_id uuid,
  _division_id uuid default null
) returns waitlist_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  _hours integer;
  _entry waitlist_entries;
begin
  if public.competition_is_full(_competition_id, _division_id) then
    return null;
  end if;

  select coalesce(c.waitlist_claim_hours, 48) into _hours
    from competitions c where c.id = _competition_id;

  -- First come, first offered. SKIP LOCKED so two teams leaving at the same
  -- moment cannot both be handed the same person.
  select * into _entry
    from waitlist_entries w
   where w.competition_id = _competition_id
     and w.status = 'waiting'
     and (_division_id is null or w.division_id is not distinct from _division_id)
   order by w.created_at
   for update skip locked
   limit 1;

  if _entry.id is null then
    return null;
  end if;

  update waitlist_entries
     set status = 'offered',
         offered_at = now(),
         offer_expires_at = now() + make_interval(hours => _hours),
         -- Same token recipe as team invites (migration 0057): two UUIDs
         -- concatenated. gen_random_bytes lives in pgcrypto, which is not on
         -- this search_path, and gen_random_uuid is core.
         claim_token = replace(gen_random_uuid()::text, '-', '')
                    || replace(gen_random_uuid()::text, '-', ''),
         updated_at = now()
   where id = _entry.id
  returning * into _entry;

  return _entry;
end;
$$;
--> statement-breakpoint

revoke all on function public.offer_next_waitlist_spot(uuid, uuid) from public;
--> statement-breakpoint
grant execute on function public.offer_next_waitlist_spot(uuid, uuid) to authenticated;
--> statement-breakpoint

/**
 * Turn a live offer into a real team.
 *
 * The registration itself is `register_team`, deliberately: a team that waited
 * has to end up indistinguishable from one that walked up, including its
 * invites and its payment state.
 */
create or replace function public.claim_waitlist_spot(
  _token text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _entry waitlist_entries;
  _team_id uuid;
begin
  if _uid is null then
    raise exception 'You need to be signed in to claim your spot.';
  end if;

  select * into _entry from waitlist_entries
   where claim_token = _token for update;
  if not found then
    raise exception 'That link is not valid.';
  end if;
  if _entry.status = 'claimed' then
    raise exception 'That spot has already been claimed.';
  end if;
  if _entry.status <> 'offered' or _entry.offer_expires_at <= now() then
    raise exception 'That offer has expired.';
  end if;

  -- Whoever holds the link and acts on it becomes captain, which is why this
  -- runs as them rather than as the original signer-upper.
  update waitlist_entries set captain_user_id = _uid, updated_at = now()
   where id = _entry.id;

  _team_id := public.register_team(
    _entry.competition_id,
    _entry.division_id,
    _entry.team_name,
    _entry.player_emails
  );

  update waitlist_entries
     set status = 'claimed',
         promoted_team_id = _team_id,
         claim_token = null,
         updated_at = now()
   where id = _entry.id;

  return _team_id;
end;
$$;
--> statement-breakpoint

revoke all on function public.claim_waitlist_spot(text) from public;
--> statement-breakpoint
grant execute on function public.claim_waitlist_spot(text) to authenticated;
--> statement-breakpoint

/**
 * Retire offers nobody claimed, and say which queues now need a fresh one.
 *
 * Returns one row per (competition, division) that just released a spot, so the
 * caller can offer it onward and send the email. Run from cron; also safe to
 * call opportunistically.
 */
create or replace function public.expire_waitlist_offers()
returns table (competition_id uuid, division_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with expired as (
    update waitlist_entries w
       set status = 'expired', claim_token = null, updated_at = now()
     where w.status = 'offered'
       and w.offer_expires_at <= now()
    returning w.competition_id, w.division_id
  )
  select distinct e.competition_id, e.division_id from expired e;
end;
$$;
--> statement-breakpoint

revoke all on function public.expire_waitlist_offers() from public;
