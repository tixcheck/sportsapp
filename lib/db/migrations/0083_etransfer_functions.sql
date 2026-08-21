-- E-transfer: recording what a team owes, and confirming what arrived.
--
-- The money moves outside the app entirely — player to organizer, by bank
-- transfer — so there is no webhook to tell us anything. The organizer is the
-- only witness, and these two functions are the whole write path:
--
--   start_etransfer_payment   the team says they'll transfer; we record a debt
--   confirm_etransfer_payment the organizer says it arrived; we record payment
--
-- Amounts are computed in TypeScript (`planEtransferCharge`) and passed in, for
-- the same reason the card path does it: the money math is pure, tested, and
-- has no business being duplicated in two languages.

/**
 * Record that a team intends to pay by e-transfer.
 *
 * Idempotent in the same way the card path is: an existing open row is returned
 * rather than a second one created, so a captain who submits twice owes one fee
 * and the organizer sees one line to confirm.
 */
create or replace function public.start_etransfer_payment(
  _competition_id uuid,
  _team_id uuid,
  _price_cents integer,
  _tax_cents integer,
  _platform_fee_cents integer,
  _total_cents integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _existing uuid;
  _email text;
  _id uuid;
begin
  if _uid is null then
    raise exception 'You need to be signed in.';
  end if;

  -- The team's own people, or the organizer recording it on their behalf.
  if not (
    public.is_competition_admin(_competition_id)
    or exists (
      select 1 from team_members tm
      where tm.team_id = _team_id and tm.user_id = _uid
    )
  ) then
    raise exception 'Only the team or the organizer can do that.';
  end if;

  if not exists (
    select 1 from teams t
    where t.id = _team_id and t.competition_id = _competition_id
  ) then
    raise exception 'That team is not in this competition.';
  end if;

  select id into _existing
    from registration_payments
   where team_id = _team_id
     and method = 'etransfer'
     and kind = 'team_full'
     and status = 'pending';
  if _existing is not null then
    return _existing;
  end if;

  select u.email into _email from users u where u.id = _uid;

  insert into registration_payments (
    competition_id, team_id, kind, method, payer_email,
    price_cents, tax_cents, platform_fee_cents,
    total_cents, application_fee_cents,
    stripe_account_id, livemode
  ) values (
    _competition_id, _team_id, 'team_full', 'etransfer', _email,
    _price_cents, _tax_cents, _platform_fee_cents,
    _total_cents, 0,
    -- No Stripe account: nothing about this payment touches Stripe. The check
    -- added in migration 0079 allows null only for non-card rows.
    null, true
  )
  on conflict do nothing
  returning id into _id;

  if _id is null then
    -- Lost the race against the partial unique index; use the winner's row.
    select id into _id
      from registration_payments
     where team_id = _team_id
       and method = 'etransfer'
       and kind = 'team_full'
       and status = 'pending';
  end if;

  return _id;
end;
$$;
--> statement-breakpoint

revoke all on function public.start_etransfer_payment(
  uuid, uuid, integer, integer, integer, integer) from public;
--> statement-breakpoint
grant execute on function public.start_etransfer_payment(
  uuid, uuid, integer, integer, integer, integer) to authenticated;
--> statement-breakpoint

/**
 * The organizer confirms money arrived, and says how much.
 *
 * An amount rather than a tick, because half a fee genuinely turns up: a team
 * sends what they have and settles later. Recording the real figure keeps the
 * ledger honest and lets the existing "is this team covered" arithmetic decide
 * whether they become an entrant, instead of a boolean that would admit a team
 * that paid $50 of $350.
 *
 * The team is promoted only when the total recorded across ALL its payments
 * covers the organizer's price — the same test the card path applies, so a team
 * that part-paid by card and part by transfer is treated correctly.
 */
create or replace function public.confirm_etransfer_payment(
  _payment_id uuid,
  _amount_cents integer,
  _note text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _row registration_payments;
  _fee integer;
  _paid integer;
begin
  if _uid is null then
    raise exception 'You need to be signed in.';
  end if;
  if _amount_cents is null or _amount_cents < 0 then
    raise exception 'Enter the amount that arrived.';
  end if;

  select * into _row from registration_payments
   where id = _payment_id for update;
  if not found then
    raise exception 'Unknown payment.';
  end if;
  if _row.method <> 'etransfer' then
    raise exception 'That payment was not an e-transfer.';
  end if;
  if not public.is_competition_admin(_row.competition_id) then
    raise exception 'Only the organizer can confirm a transfer.';
  end if;
  if _row.status = 'paid' then
    raise exception 'That transfer is already confirmed.';
  end if;

  update registration_payments
     set status = 'paid',
         -- What actually arrived, which may be less than what was owed. Tax is
         -- left as quoted; the organizer remits on what they received and the
         -- shortfall shows as an outstanding balance either way.
         price_cents = greatest(0, _amount_cents - coalesce(tax_cents, 0)),
         total_cents = _amount_cents,
         paid_at = now(),
         confirmed_by_user_id = _uid,
         confirmation_note = nullif(btrim(coalesce(_note, '')), ''),
         updated_at = now()
   where id = _payment_id;

  -- Promote the team if its fee is now covered, measured the same way the card
  -- path measures it: against the organizer's price, summing every payment.
  select coalesce(cps.registration_fee_cents, 0) into _fee
    from competition_payment_settings cps
   where cps.competition_id = _row.competition_id;

  select coalesce(sum(rp.price_cents), 0) into _paid
    from registration_payments rp
   where rp.team_id = _row.team_id and rp.status = 'paid';

  if _fee > 0 and _paid >= _fee then
    update teams set status = 'active'
     where id = _row.team_id and status = 'pending_payment';
    return true;
  end if;

  return false;
end;
$$;
--> statement-breakpoint

revoke all on function public.confirm_etransfer_payment(uuid, integer, text) from public;
--> statement-breakpoint
grant execute on function public.confirm_etransfer_payment(uuid, integer, text) to authenticated;
--> statement-breakpoint

/**
 * Platform fees owed on confirmed e-transfers, per competition.
 *
 * We never touched this money, so the fee could not be deducted at the time.
 * `platform_fee_settled_at` marks a fee we have since collected; this is what's
 * still outstanding.
 */
create or replace function public.etransfer_fees_owed(_competition_id uuid)
returns table (payments integer, fee_cents integer)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int, coalesce(sum(platform_fee_cents), 0)::int
    from registration_payments
   where competition_id = _competition_id
     and method = 'etransfer'
     and status = 'paid'
     and platform_fee_settled_at is null
     and public.is_competition_admin(_competition_id);
$$;
--> statement-breakpoint

revoke all on function public.etransfer_fees_owed(uuid) from public;
--> statement-breakpoint
grant execute on function public.etransfer_fees_owed(uuid) to authenticated;
