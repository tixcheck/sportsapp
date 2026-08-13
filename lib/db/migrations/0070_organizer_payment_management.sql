-- Payments Slice C -- what an organizer can do about money after it moves.
--
-- Slice B could take a payment and gate a team on it. It had no answer for the
-- three things that actually happen at a real event: a team that shows up
-- having paid half, a team that has to be given its money back, and a team the
-- organizer registers themselves and chases for payment afterwards.
--
-- Two additions, both audit trails rather than state machines:
--
--   1. Refund state on `registration_payments`. Recorded PRO RATA against the
--      payer's total, because that is exactly what Stripe does to a destination
--      charge refunded with reverse_transfer + refund_application_fee: the
--      organizer's cut and the platform's cut come back in the same proportion
--      they went out. Storing a single `refunded_cents` and deriving the rest
--      keeps our books agreeing with Stripe's by construction.
--
--   2. The admit-unpaid trail on `teams`. An organizer may admit a team that
--      has not covered its fee -- that decision is theirs to make and ours to
--      record. The team becomes a real entrant; the balance stays outstanding
--      and keeps showing on the payments dashboard. Waiving the debt and
--      admitting the team are deliberately NOT the same action.
--
-- Writes stay off the browser, as in 0064: refunds are written by the
-- `charge.refunded` webhook using the secret key (Stripe is the authority on
-- whether money moved), and the admission is a SECURITY DEFINER function.

-- How much of the payer's total has been handed back. Kept as a running total
-- rather than a boolean: Stripe permits several partial refunds against one
-- payment intent, and `charge.refunded` reports the cumulative amount.
alter table "registration_payments"
  add column "refunded_cents" integer not null default 0;
--> statement-breakpoint

alter table "registration_payments"
  add column "stripe_refund_id" text;
--> statement-breakpoint

alter table "registration_payments"
  add column "refunded_at" timestamptz;
--> statement-breakpoint

-- The organizer's own words, shown back to the payer on their payments page.
-- "Why was I refunded $40" is otherwise unanswerable without asking someone.
alter table "registration_payments"
  add column "refund_reason" text;
--> statement-breakpoint

-- Never hand back more than was taken. A refund larger than the charge would
-- mean the platform is paying people to register.
alter table "registration_payments"
  add constraint "registration_payments_refund_within_total" check (
    "refunded_cents" >= 0 and "refunded_cents" <= "total_cents"
  );
--> statement-breakpoint

-- Only a charge that was actually collected can be refunded. Guards against a
-- pending or abandoned row being marked refunded by a stray webhook.
alter table "registration_payments"
  add constraint "registration_payments_refund_needs_payment" check (
    "refunded_cents" = 0 or "paid_at" is not null
  );
--> statement-breakpoint

-- Refund reconciliation looks payments up by payment intent, not by session:
-- `charge.refunded` carries the charge and its intent, never our session id.
create index "registration_payments_payment_intent_idx"
  on "registration_payments" ("stripe_payment_intent_id")
  where "stripe_payment_intent_id" is not null;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Admitting a team that has not paid in full
-- ---------------------------------------------------------------------------

alter table "teams"
  add column "admitted_unpaid_at" timestamptz;
--> statement-breakpoint

alter table "teams"
  add column "admitted_unpaid_by" uuid references "users"("id") on delete set null;
--> statement-breakpoint

alter table "teams"
  add column "admitted_unpaid_note" text;
--> statement-breakpoint

-- Admit a `pending_payment` team as a real entrant despite an outstanding
-- balance.
--
-- SECURITY DEFINER for the same reason register_team is: the caller must not be
-- able to move their own team's status directly, and the admin check has to
-- happen in the same statement that writes. `teams` has no UPDATE policy that
-- would let a captain do this from the browser.
--
-- Deliberately does NOT touch registration_payments. The team plays; the money
-- is still owed. An organizer who means to forgive the debt refunds or waives
-- it explicitly -- conflating the two would silently erase receivables.
create or replace function public.admit_team_unpaid(
  _team_id uuid,
  _note text default null
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  _competition uuid;
  _status team_status;
begin
  select t.competition_id, t.status into _competition, _status
  from teams t where t.id = _team_id;

  if _competition is null then
    raise exception 'That team does not exist.';
  end if;

  if not public.is_competition_admin(_competition) then
    raise exception 'Only an organizer can admit a team that has not paid.';
  end if;

  -- Already an entrant. Returning false rather than raising keeps a
  -- double-clicked button from showing the organizer an error for a
  -- state they wanted anyway.
  if _status <> 'pending_payment' then
    return false;
  end if;

  update teams
  set status = 'active',
      -- payment_mode only steers the "how do I pay" UI while a fee is
      -- outstanding and unadmitted; clearing it matches what settling does.
      payment_mode = null,
      admitted_unpaid_at = now(),
      admitted_unpaid_by = auth.uid(),
      admitted_unpaid_note = nullif(btrim(coalesce(_note, '')), '')
  where id = _team_id and status = 'pending_payment';

  return true;
end;
$$;
--> statement-breakpoint

grant execute on function public.admit_team_unpaid(uuid, text) to authenticated;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Organizer-registered teams
-- ---------------------------------------------------------------------------

-- Register a team on the organizer's behalf, bypassing the public-registration
-- gates (open/closed, deadline, visibility) but NOT capacity or payment.
--
-- A separate function rather than a flag on register_team because the
-- authorization is inverted: register_team authorizes the CALLER as the future
-- captain, while here the caller is an admin creating a team for people who may
-- not have accounts yet. Folding both into one function would make the "who is
-- allowed" branch the most dangerous line in the codebase.
--
-- The organizer does NOT join the team. The first listed email is invited as
-- CAPTAIN (`team_invites.role = 'captain'`, the flow claim_team already
-- implements); the rest are invited as players. That is why teams.captain_user_id
-- is nullable -- this is the case it was made nullable for.
--
-- Payment gating still applies: adding a team to a paid event yields a
-- `pending_payment` team and a payment link to send, which is the point of the
-- feature. An organizer who wants them in regardless calls admit_team_unpaid
-- afterwards -- one decision, recorded, not implied.
create or replace function public.organizer_register_team(
  _competition_id uuid,
  _division_id uuid,
  _team_name text,
  _player_emails jsonb,
  _payment_mode registration_payment_kind default 'team_full'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _team_id uuid;
  _max_teams integer;
  _current_teams integer;
  _fee_cents integer;
  _payment_required boolean;
  _status team_status := 'active';
  _elem jsonb;
  _pe text;
  _pname text;
  _role team_member_role;
  _target uuid;
  _token text;
  _first boolean := true;
  _contact text := '';
begin
  if not public.is_competition_admin(_competition_id) then
    raise exception 'Only an organizer can add a team to this competition.';
  end if;

  if btrim(coalesce(_team_name, '')) = '' then
    raise exception 'A team needs a name.';
  end if;

  if _division_id is not null and not exists (
    select 1 from divisions d
    where d.id = _division_id and d.competition_id = _competition_id
  ) then
    raise exception 'Invalid division.';
  end if;

  -- Capacity is a real-world constraint (courts, time), not a registration
  -- policy, so it binds the organizer too. Counted inside the inserting
  -- function, as in register_team, so concurrent adds cannot both take the
  -- last spot. Withdrawn teams free their spot back up.
  select case when c.type = 'tournament' then ts.max_teams else ls.max_teams end,
         coalesce(cps.registration_fee_cents, 0),
         coalesce(cps.payment_required, false)
    into _max_teams, _fee_cents, _payment_required
  from competitions c
  left join tournament_settings ts on ts.competition_id = c.id
  left join league_settings ls on ls.competition_id = c.id
  left join competition_payment_settings cps on cps.competition_id = c.id
  where c.id = _competition_id;

  if not found then
    raise exception 'Competition not found.';
  end if;

  if _max_teams is not null then
    select count(*) into _current_teams
    from teams t
    where t.competition_id = _competition_id and t.status <> 'withdrawn';

    if _current_teams >= _max_teams then
      raise exception 'This event is full — all % spots have been taken.', _max_teams;
    end if;
  end if;

  if _payment_required and _fee_cents > 0 then
    _status := 'pending_payment';
  end if;

  insert into teams (competition_id, division_id, name, status, payment_mode)
  values (
    _competition_id, _division_id, btrim(_team_name), _status,
    case when _status = 'pending_payment' then _payment_mode else null end
  )
  returning id into _team_id;

  -- Invite the roster. Element shape matches register_team: { name, email } or
  -- a plain email string.
  for _elem in select value from jsonb_array_elements(coalesce(_player_emails, '[]'::jsonb))
  loop
    if jsonb_typeof(_elem) = 'string' then
      _pe := _elem #>> '{}';
      _pname := null;
    else
      _pe := _elem ->> 'email';
      _pname := nullif(btrim(coalesce(_elem ->> 'name', '')), '');
    end if;

    if _pe is null or btrim(_pe) = '' then continue; end if;

    -- The first real email leads the team: they get the captain invite and
    -- become the registration's contact.
    if _first then
      _role := 'captain';
      _contact := lower(btrim(_pe));
      _first := false;
    else
      _role := 'player';
    end if;

    _token := replace(gen_random_uuid()::text, '-', '')
           || replace(gen_random_uuid()::text, '-', '');
    insert into team_invites (team_id, email, name, token, role, invited_by_user_id, expires_at)
    values (_team_id, btrim(_pe), _pname, _token, _role, _uid, now() + interval '30 days');

    -- Someone who already has an account joins immediately, exactly as
    -- register_team does for teammates -- an organizer-added team should not
    -- make an existing user click an invite to appear on their own roster.
    select u.id into _target from users u
    where lower(u.email) = lower(btrim(_pe)) limit 1;

    if _target is not null then
      insert into team_members (team_id, user_id, role)
      values (_team_id, _target, _role)
      on conflict (team_id, user_id) do update set role = excluded.role;

      if _role = 'captain' then
        update teams set captain_user_id = _target where id = _team_id;
      end if;

      if _pname is not null then
        update users set display_name = _pname
        where id = _target and coalesce(btrim(display_name), '') = '';
      end if;

      update team_invites set status = 'accepted', accepted_by_user_id = _target
      where team_id = _team_id and lower(email) = lower(btrim(_pe)) and status = 'pending';
    end if;
  end loop;

  insert into team_registrations (team_id, competition_id, contact_email, player_emails)
  values (_team_id, _competition_id, _contact, coalesce(_player_emails, '[]'::jsonb));

  return _team_id;
end;
$$;
--> statement-breakpoint

grant execute on function public.organizer_register_team(
  uuid, uuid, text, jsonb, registration_payment_kind
) to authenticated;
