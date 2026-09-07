-- Offline payment for a single player, not just a team.
--
-- Brampton Volleyball League's eight PayPal links are four TEAM FEE links and
-- four INDY FEE links — they take individuals into every one of their four
-- leagues. Migration 0102 gave teams a PayPal path; without this, a free agent
-- at a Stripe-less organization has no way to pay at all and sits in
-- `pending_payment` forever with nothing anyone can do about it.
--
-- E-transfer never covered individuals either, so this closes that gap for
-- both methods at once rather than only for PayPal.

/**
 * Record that a free agent intends to pay their own fee offline.
 *
 * Mirrors `start_offline_payment`, with the payer being a person rather than a
 * team: `team_id` stays null and `free_agent_id` carries it, which is the
 * shape the `registration_payments_one_payer` check (migration 0076) requires.
 */
create or replace function public.start_offline_individual_payment(
  _competition_id uuid,
  _free_agent_id uuid,
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

  -- The free agent themselves, or the organizer recording it for them.
  if not (
    public.is_competition_admin(_competition_id)
    or exists (
      select 1 from free_agents fa
      where fa.id = _free_agent_id
        and fa.competition_id = _competition_id
        and fa.user_id = _uid
    )
  ) then
    raise exception 'Only you or the organizer can do that.';
  end if;

  if not exists (
    select 1 from free_agents fa
    where fa.id = _free_agent_id and fa.competition_id = _competition_id
  ) then
    raise exception 'That sign-up is not in this competition.';
  end if;

  if _method = 'paypal' and not exists (
    select 1 from competition_payment_settings cps
     where cps.competition_id = _competition_id
       and cps.paypal_individual_url is not null
  ) then
    raise exception 'This event does not take PayPal from individuals.';
  end if;

  if _method = 'etransfer' and not exists (
    select 1 from competition_payment_settings cps
     where cps.competition_id = _competition_id
       and cps.etransfer_email is not null
  ) then
    raise exception 'This event does not take e-transfers.';
  end if;

  select id into _existing
    from registration_payments
   where free_agent_id = _free_agent_id
     and method <> 'card'
     and status = 'pending';

  if _existing is not null then
    update registration_payments
       set method = _method::payment_method, updated_at = now()
     where id = _existing;
    return _existing;
  end if;

  select u.email into _email from users u where u.id = _uid;

  insert into registration_payments (
    competition_id, free_agent_id, kind, method, payer_email,
    price_cents, tax_cents, platform_fee_cents,
    total_cents, application_fee_cents,
    stripe_account_id, livemode
  ) values (
    _competition_id, _free_agent_id, 'individual', _method::payment_method,
    _email,
    _price_cents, _tax_cents, _platform_fee_cents,
    _total_cents, 0,
    null, true
  )
  on conflict do nothing
  returning id into _id;

  if _id is null then
    select id into _id
      from registration_payments
     where free_agent_id = _free_agent_id
       and method <> 'card'
       and status = 'pending';
  end if;

  return _id;
end;
$$;
--> statement-breakpoint

revoke all on function public.start_offline_individual_payment(
  uuid, uuid, text, integer, integer, integer, integer) from public;
--> statement-breakpoint
grant execute on function public.start_offline_individual_payment(
  uuid, uuid, text, integer, integer, integer, integer) to authenticated;
--> statement-breakpoint

-- One open offline obligation per free agent, mirroring the team rule from
-- migration 0102. Without it, a signer-upper who clicks twice owes twice.
create unique index if not exists "registration_payments_one_open_offline_individual"
  on "registration_payments" ("free_agent_id")
  where "method" <> 'card' and "kind" = 'individual' and "status" = 'pending';
--> statement-breakpoint

/**
 * Confirming an offline payment, now covering individuals as well as teams.
 *
 * Replaces the version in migration 0102. A payment belongs to exactly one of
 * a team or a free agent — the `registration_payments_one_payer` check
 * guarantees it — so this branches on which, and promotes accordingly:
 *
 *   team        pending_payment -> active   (once the team fee is covered)
 *   free agent  pending_payment -> available (once their own fee is covered)
 *
 * The free agent case measures against `individual_fee_cents`, NOT the team
 * fee. They are different products at different prices, and comparing one
 * person's payment to a whole team's price would leave every free agent
 * permanently short.
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
         -- What actually arrived, which may be less than what was owed.
         price_cents = greatest(0, _amount_cents - coalesce(tax_cents, 0)),
         total_cents = _amount_cents,
         paid_at = now(),
         confirmed_by_user_id = _uid,
         confirmation_note = nullif(btrim(coalesce(_note, '')), ''),
         updated_at = now()
   where id = _payment_id;

  if _row.free_agent_id is not null then
    select coalesce(cps.individual_fee_cents, 0) into _fee
      from competition_payment_settings cps
     where cps.competition_id = _row.competition_id;

    select coalesce(sum(rp.price_cents), 0) into _paid
      from registration_payments rp
     where rp.free_agent_id = _row.free_agent_id and rp.status = 'paid';

    if _fee > 0 and _paid >= _fee then
      update free_agents set status = 'available', updated_at = now()
       where id = _row.free_agent_id and status = 'pending_payment';
      return true;
    end if;

    return false;
  end if;

  select coalesce(cps.registration_fee_cents, 0) into _fee
    from competition_payment_settings cps
   where cps.competition_id = _row.competition_id;

  select coalesce(sum(rp.price_cents), 0) into _paid
    from registration_payments rp
   where rp.team_id = _row.team_id and rp.status = 'paid';

  if _fee > 0 and _paid >= _fee then
    -- Only lifts a payment hold. A team short of its roster minimum or missing
    -- a waiver signature stays `pending_waiver`; migration 0101 owns that gate.
    update teams set status = 'active'
     where id = _row.team_id and status = 'pending_payment';
    return true;
  end if;

  return false;
end;
$$;
