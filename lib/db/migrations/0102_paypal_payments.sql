-- PayPal payment links: a third way money can reach an organizer.
--
-- Brampton Volleyball League is running their first season with us and wants to
-- keep collecting through their own PayPal account rather than connect Stripe.
-- They gave us eight hosted "no-code checkout" links — a TEAM FEE and an INDY
-- FEE for each of their four leagues.
--
-- Mechanically this is the e-transfer path, not the card path. The money never
-- touches us, there is no webhook, and the organizer is the only witness that
-- it arrived. So rather than build a second confirmation flow, this migration
-- GENERALISES the e-transfer functions to any offline method and adds PayPal as
-- the second one. `start_etransfer_payment`, `confirm_etransfer_payment` and
-- `etransfer_fees_owed` survive as thin wrappers so a deploy that lands after
-- this migration but before the new code keeps working.
--
-- One property of those links drives the design and is worth writing down: a
-- link is created once and shared by every team in the competition, so it can
-- carry NO per-payer reference. Its return URL is therefore identical for
-- everyone, is an ordinary unauthenticated GET, and proves nothing. Landing on
-- it records an INTENT to pay. Only the organizer moves a row to `paid`.

-- ---------------------------------------------------------------------------
-- 1. The method itself
-- ---------------------------------------------------------------------------

alter type "payment_method" add value if not exists 'paypal';
--> statement-breakpoint

-- What the payer says identifies their payment — a PayPal transaction ID they
-- copy off the receipt. Deliberately separate from `confirmation_note`, which
-- is the ORGANIZER's words: one is a claim, the other is a finding, and
-- collapsing them would lose which of the two you are reading.
alter table "registration_payments"
  add column if not exists "payer_reference" text;
--> statement-breakpoint

do $$ begin
  alter table "registration_payments"
    add constraint "registration_payments_payer_reference_len"
    check ("payer_reference" is null or length("payer_reference") <= 120);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

-- One open OFFLINE obligation per team, replacing the e-transfer-only index
-- from migration 0079. Broader on purpose: a team that has said "I'll
-- e-transfer" and then pays by PayPal should still owe one fee, not two, and
-- the organizer should see one line to confirm rather than a choice of which
-- to believe. Expressed as `method <> 'card'` so it needs no reference to the
-- enum value added above.
drop index if exists "registration_payments_one_open_etransfer";
--> statement-breakpoint

create unique index if not exists "registration_payments_one_open_offline"
  on "registration_payments" ("team_id")
  where "method" <> 'card' and "kind" = 'team_full' and "status" = 'pending';
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Where the organizer's links live
-- ---------------------------------------------------------------------------
--
-- Two links, because a team fee and an individual fee are different products
-- in PayPal's dashboard with different amounts and different caps. Presence of
-- a link IS the switch, exactly as `etransfer_email` is: an organizer who
-- hasn't given one isn't offering PayPal, and a second flag could disagree
-- with it.

alter table "competition_payment_settings"
  add column if not exists "paypal_team_url" text;
--> statement-breakpoint

alter table "competition_payment_settings"
  add column if not exists "paypal_individual_url" text;
--> statement-breakpoint

-- Shown beside the button ("put your team name in the PayPal note").
alter table "competition_payment_settings"
  add column if not exists "paypal_note" text;
--> statement-breakpoint

-- Constrained to PayPal's own domains over TLS. This is not paranoia about the
-- organizer: it is that an organizer pastes a link into a box, we render it as
-- the primary action on a payment page, and every player follows it. A typo
-- that lands somewhere else would be indistinguishable from a phishing link.
do $$ begin
  alter table "competition_payment_settings"
    add constraint "competition_payment_settings_paypal_team_url_shape"
    check (
      "paypal_team_url" is null
      or ("paypal_team_url" ~ '^https://(www\.)?(paypal\.com|paypal\.me)/\S+$'
          and length("paypal_team_url") <= 500)
    );
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

do $$ begin
  alter table "competition_payment_settings"
    add constraint "competition_payment_settings_paypal_indy_url_shape"
    check (
      "paypal_individual_url" is null
      or ("paypal_individual_url" ~ '^https://(www\.)?(paypal\.com|paypal\.me)/\S+$'
          and length("paypal_individual_url") <= 500)
    );
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

do $$ begin
  alter table "competition_payment_settings"
    add constraint "competition_payment_settings_paypal_note_len"
    check ("paypal_note" is null or length("paypal_note") <= 500);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Starting an offline payment
-- ---------------------------------------------------------------------------

/**
 * Record that a team intends to pay by a method that bypasses us.
 *
 * `_method` arrives as text and is cast inside the body rather than typed as
 * `payment_method` in the signature: the enum value added at the top of this
 * migration cannot be referenced at parse time in the same transaction, and a
 * plpgsql body is only resolved when it runs.
 *
 * Idempotent like the card path — an existing open row is returned rather than
 * a second one created, so a captain who clicks twice owes one fee.
 */
create or replace function public.start_offline_payment(
  _competition_id uuid,
  _team_id uuid,
  _method text,
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

  if _method not in ('etransfer', 'paypal') then
    raise exception 'Unknown payment method.';
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

  -- Defence in depth: the action checks this too, but a payment row for a
  -- method the organizer never switched on would be a debt nobody can settle.
  if _method = 'paypal' and not exists (
    select 1 from competition_payment_settings cps
     where cps.competition_id = _competition_id
       and cps.paypal_team_url is not null
  ) then
    raise exception 'This event does not take PayPal.';
  end if;

  if _method = 'etransfer' and not exists (
    select 1 from competition_payment_settings cps
     where cps.competition_id = _competition_id
       and cps.etransfer_email is not null
  ) then
    raise exception 'This event does not take e-transfers.';
  end if;

  -- Any open offline obligation counts, whichever method it was started under:
  -- the unique index above allows only one, and a captain who switches from
  -- e-transfer to PayPal should reuse it rather than be refused.
  select id into _existing
    from registration_payments
   where team_id = _team_id
     and method <> 'card'
     and kind = 'team_full'
     and status = 'pending';

  if _existing is not null then
    -- Reflect the method they actually went with, so the organizer's inbox
    -- tells them where to go looking for the money.
    update registration_payments
       set method = _method::payment_method,
           updated_at = now()
     where id = _existing;
    return _existing;
  end if;

  select u.email into _email from users u where u.id = _uid;

  insert into registration_payments (
    competition_id, team_id, kind, method, payer_email,
    price_cents, tax_cents, platform_fee_cents,
    total_cents, application_fee_cents,
    stripe_account_id, livemode
  ) values (
    _competition_id, _team_id, 'team_full', _method::payment_method, _email,
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
       and method <> 'card'
       and kind = 'team_full'
       and status = 'pending';
  end if;

  return _id;
end;
$$;
--> statement-breakpoint

revoke all on function public.start_offline_payment(
  uuid, uuid, text, integer, integer, integer, integer) from public;
--> statement-breakpoint
grant execute on function public.start_offline_payment(
  uuid, uuid, text, integer, integer, integer, integer) to authenticated;
--> statement-breakpoint

/**
 * The payer's own claim about a payment we cannot see.
 *
 * Everything here is UNVERIFIED by construction — a PayPal return URL is an
 * ordinary GET that anyone can visit, and the transaction ID is whatever the
 * payer typed. It moves nothing to `paid`; it only gives the organizer
 * something to reconcile against. Callable by the payer, which is exactly why
 * it can't change status.
 */
create or replace function public.record_payer_reference(
  _payment_id uuid,
  _reference text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _row registration_payments;
begin
  if _uid is null then
    raise exception 'You need to be signed in.';
  end if;

  select * into _row from registration_payments
   where id = _payment_id for update;
  if not found then
    raise exception 'Unknown payment.';
  end if;
  if _row.method = 'card' then
    raise exception 'That payment was taken by card.';
  end if;
  if _row.status <> 'pending' then
    -- Already settled. Silently doing nothing is right: the payer has done
    -- their part and an error here would read as "your money is lost".
    return false;
  end if;

  if not (
    public.is_competition_admin(_row.competition_id)
    or exists (
      select 1 from team_members tm
      where tm.team_id = _row.team_id and tm.user_id = _uid
    )
  ) then
    raise exception 'Only the team or the organizer can do that.';
  end if;

  update registration_payments
     set payer_reference = nullif(btrim(coalesce(_reference, '')), ''),
         updated_at = now()
   where id = _payment_id;

  return true;
end;
$$;
--> statement-breakpoint

revoke all on function public.record_payer_reference(uuid, text) from public;
--> statement-breakpoint
grant execute on function public.record_payer_reference(uuid, text) to authenticated;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. Confirming one
-- ---------------------------------------------------------------------------

/**
 * The organizer confirms money arrived, and says how much.
 *
 * An amount rather than a tick, because half a fee genuinely turns up: a team
 * sends what they have and settles later. The team is promoted only when the
 * total recorded across ALL its payments covers the organizer's price — the
 * same test the card path applies.
 */
create or replace function public.confirm_offline_payment(
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
  if _row.method = 'card' then
    raise exception 'That payment was taken by card.';
  end if;
  if not public.is_competition_admin(_row.competition_id) then
    raise exception 'Only the organizer can confirm a payment.';
  end if;
  if _row.status = 'paid' then
    raise exception 'That payment is already confirmed.';
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

  select coalesce(cps.registration_fee_cents, 0) into _fee
    from competition_payment_settings cps
   where cps.competition_id = _row.competition_id;

  select coalesce(sum(rp.price_cents), 0) into _paid
    from registration_payments rp
   where rp.team_id = _row.team_id and rp.status = 'paid';

  if _fee > 0 and _paid >= _fee then
    -- Only lifts a payment hold. A team still short of its roster minimum or
    -- missing a waiver signature stays `pending_waiver` — paying is not the
    -- only gate, and migration 0101's trigger owns that one.
    update teams set status = 'active'
     where id = _row.team_id and status = 'pending_payment';
    return true;
  end if;

  return false;
end;
$$;
--> statement-breakpoint

revoke all on function public.confirm_offline_payment(uuid, integer, text) from public;
--> statement-breakpoint
grant execute on function public.confirm_offline_payment(uuid, integer, text) to authenticated;
--> statement-breakpoint

/**
 * Platform fees owed on confirmed offline payments, per competition.
 *
 * We never touched this money, so the fee could not be deducted at the time.
 * Zero for an organizer whose platform fee is waived, which is how the BVL
 * trial ends up owing nothing without any special case here.
 */
create or replace function public.offline_fees_owed(_competition_id uuid)
returns table (payments integer, fee_cents integer)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int, coalesce(sum(platform_fee_cents), 0)::int
    from registration_payments
   where competition_id = _competition_id
     and method <> 'card'
     and status = 'paid'
     and platform_fee_settled_at is null
     and public.is_competition_admin(_competition_id);
$$;
--> statement-breakpoint

revoke all on function public.offline_fees_owed(uuid) from public;
--> statement-breakpoint
grant execute on function public.offline_fees_owed(uuid) to authenticated;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. The old names, kept working
-- ---------------------------------------------------------------------------
--
-- Wrappers rather than duplicates. A deploy where the migration lands before
-- the new code — the normal order — must not break e-transfers in the gap.

create or replace function public.start_etransfer_payment(
  _competition_id uuid,
  _team_id uuid,
  _price_cents integer,
  _tax_cents integer,
  _platform_fee_cents integer,
  _total_cents integer
) returns uuid
language sql
security definer
set search_path = public
as $$
  select public.start_offline_payment(
    _competition_id, _team_id, 'etransfer',
    _price_cents, _tax_cents, _platform_fee_cents, _total_cents);
$$;
--> statement-breakpoint

create or replace function public.confirm_etransfer_payment(
  _payment_id uuid,
  _amount_cents integer,
  _note text default null
) returns boolean
language sql
security definer
set search_path = public
as $$
  select public.confirm_offline_payment(_payment_id, _amount_cents, _note);
$$;
--> statement-breakpoint

create or replace function public.etransfer_fees_owed(_competition_id uuid)
returns table (payments integer, fee_cents integer)
language sql
stable
security definer
set search_path = public
as $$
  select * from public.offline_fees_owed(_competition_id);
$$;
