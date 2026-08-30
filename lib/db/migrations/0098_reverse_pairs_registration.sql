-- Registration for Reverse Pairs.
--
-- The format shipped with a draw and a public page but no way for anyone to
-- sign up: the organizer typed the field in by hand. That is fine for a test
-- and useless for a real tournament, where the whole point is publishing a link
-- and letting it fill.
--
-- `register_team` cannot be reused. It reads registration state out of
-- `tournament_settings` or `league_settings` by branching on the competition
-- type, so a Reverse Pairs event finds neither row, `_reg_open` comes back null
-- and every sign-up is refused. It also builds a roster of player emails and
-- issues captain invites, which is a team's shape, not a pair's.
--
-- So: the same three registration controls every other format has, on
-- `reverse_pairs_settings`, and a register function shaped like a pair.
--
-- A pair is one `teams` row, as it already is here and in beach doubles. Both
-- players are recorded: the person signing up becomes the captain, and their
-- partner gets an invite so they can claim their half without a second sign-up.

alter table "reverse_pairs_settings"
  add column if not exists "registration_open" boolean not null default false;
--> statement-breakpoint

alter table "reverse_pairs_settings"
  add column if not exists "registration_deadline" timestamptz;
--> statement-breakpoint

-- Null = uncapped. Enforced inside the register function as a count rather than
-- a row constraint, so two pairs hitting Register at the same instant cannot
-- both take the last spot.
alter table "reverse_pairs_settings"
  add column if not exists "max_pairs" integer;
--> statement-breakpoint

alter table "reverse_pairs_settings"
  drop constraint if exists "reverse_pairs_settings_max_pairs_check";
--> statement-breakpoint

alter table "reverse_pairs_settings"
  add constraint "reverse_pairs_settings_max_pairs_check"
  check ("max_pairs" is null or "max_pairs" between 2 and 200);
--> statement-breakpoint

/**
 * Sign a pair up.
 *
 * SECURITY DEFINER because `teams` has no INSERT policy for a non-organizer —
 * every registration in this app goes through a function that decides whether
 * the event is actually taking sign-ups. The gates are the same three the other
 * formats use: the event is public, registration is open, the deadline has not
 * passed, and there is a spot left.
 *
 * Unpaid pairs enter as `pending_payment`, which the schedule and standings
 * already exclude everywhere — an unpaid entrant must never reach a draw.
 */
create or replace function public.register_reverse_pair(
  _competition_id uuid,
  _pair_name text,
  _partner_email text default null,
  _partner_name text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _visibility text;
  _reg_open boolean;
  _deadline timestamptz;
  _max_pairs int;
  _fee_cents int;
  _payment_required boolean;
  _taken int;
  _team_id uuid;
  _token text;
begin
  if _uid is null then
    raise exception 'You must be signed in to register.';
  end if;
  if length(btrim(coalesce(_pair_name, ''))) = 0 then
    raise exception 'Your pair needs a name.';
  end if;

  select c.visibility::text,
         coalesce(rp.registration_open, false),
         rp.registration_deadline,
         rp.max_pairs,
         coalesce(cps.registration_fee_cents, 0),
         coalesce(cps.payment_required, false)
    into _visibility, _reg_open, _deadline, _max_pairs,
         _fee_cents, _payment_required
    from competitions c
    left join reverse_pairs_settings rp on rp.competition_id = c.id
    left join competition_payment_settings cps on cps.competition_id = c.id
   where c.id = _competition_id and c.type = 'reverse_pairs';

  if _visibility is null then
    raise exception 'Event not found.';
  end if;
  if _visibility is distinct from 'public' then
    raise exception 'Registration is not open for this event.';
  end if;
  if not _reg_open then
    raise exception 'Registration is not open for this event.';
  end if;
  if _deadline is not null and _deadline < now() then
    raise exception 'The registration deadline has passed.';
  end if;

  -- One sign-up per person. Without this a refresh of the confirmation page, or
  -- an impatient second click, quietly enters the same pair twice.
  if exists (
    select 1 from teams t
    where t.competition_id = _competition_id
      and t.captain_user_id = _uid
      and t.status <> 'withdrawn'
  ) then
    raise exception 'You have already registered a pair for this event.';
  end if;

  -- Capacity counted inside the function that inserts, so the last spot cannot
  -- go to two pairs at once. Withdrawn pairs free their spot back up.
  if _max_pairs is not null then
    select count(*) into _taken
      from teams t
     where t.competition_id = _competition_id
       and t.status <> 'withdrawn';
    if _taken >= _max_pairs then
      raise exception 'This event is full.';
    end if;
  end if;

  insert into teams (competition_id, name, captain_user_id, status)
  values (
    _competition_id,
    btrim(_pair_name),
    _uid,
    case when _payment_required and _fee_cents > 0
         then 'pending_payment'::team_status
         else 'active'::team_status
    end
  )
  returning id into _team_id;

  insert into team_members (team_id, user_id, role)
  values (_team_id, _uid, 'captain')
  on conflict do nothing;

  -- The partner, if one was given. An invite rather than a bare row, so they
  -- claim their own place and end up with an account of their own.
  if length(btrim(coalesce(_partner_email, ''))) > 0 then
    -- gen_random_uuid lives in pg_catalog and is always reachable; the
    -- pgcrypto gen_random_bytes is in `extensions`, which this function's
    -- `search_path = public` deliberately excludes. Same construction
    -- register_team uses.
    _token := replace(gen_random_uuid()::text, '-', '')
           || replace(gen_random_uuid()::text, '-', '');
    insert into team_invites (team_id, email, name, token, role, invited_by_user_id)
    values (
      _team_id,
      lower(btrim(_partner_email)),
      nullif(btrim(coalesce(_partner_name, '')), ''),
      _token,
      'player',
      _uid
    );
  end if;

  return _team_id;
end;
$$;
--> statement-breakpoint

comment on function public.register_reverse_pair is
  'Sign a pair up for a Reverse Pairs event. Enforces public visibility, registration open, deadline and capacity. Unpaid pairs enter as pending_payment.';
--> statement-breakpoint

revoke all on function public.register_reverse_pair(uuid, text, text, text) from public;
--> statement-breakpoint
grant execute on function public.register_reverse_pair(uuid, text, text, text) to authenticated;
