-- The reference an organizer actually matched a payment against.
--
-- Confirming a payment already recorded the amount, who confirmed it and when,
-- plus an optional free-text note. That is enough to run a league and thin if
-- anyone ever disputes one: "confirmed by V on 8 September for $1,380" is
-- weaker than "confirmed against PayPal transaction 8XW12345AB678901C".
--
-- Three fields now, and they are three different things:
--
--   payer_reference       what the PAYER typed on the return page. A claim.
--   confirmed_reference   what the ORGANIZER matched it to. A finding.
--   confirmation_note     anything else they want to record. Prose.
--
-- Kept apart because collapsing them loses which of the three you are reading,
-- and the difference between a claim and a finding is the entire point of
-- having an organizer confirm anything.

alter table "registration_payments"
  add column if not exists "confirmed_reference" text;
--> statement-breakpoint

do $$ begin
  alter table "registration_payments"
    add constraint "registration_payments_confirmed_reference_len"
    check ("confirmed_reference" is null or length("confirmed_reference") <= 120);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

-- The three-argument version has to GO, not stay as a fallback. With both
-- present, a three-argument call matches the old signature exactly AND the new
-- one by its default, and Postgres refuses: "function is not unique". Keeping
-- it for deploy safety would have broken every confirmation instead of none.
drop function if exists public.confirm_offline_payment(uuid, integer, text);
--> statement-breakpoint

/**
 * Confirm an offline payment, recording the reference it was matched against.
 */
create or replace function public.confirm_offline_payment(
  _payment_id uuid,
  _amount_cents integer,
  _note text default null,
  _reference text default null
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
         price_cents = greatest(0, _amount_cents - coalesce(tax_cents, 0)),
         total_cents = _amount_cents,
         paid_at = now(),
         confirmed_by_user_id = _uid,
         confirmation_note = nullif(btrim(coalesce(_note, '')), ''),
         confirmed_reference = nullif(btrim(coalesce(_reference, '')), ''),
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
--> statement-breakpoint

revoke all on function public.confirm_offline_payment(uuid, integer, text, text) from public;
--> statement-breakpoint
grant execute on function public.confirm_offline_payment(uuid, integer, text, text) to authenticated;
--> statement-breakpoint

-- The compatibility wrapper from migration 0102 called the three-argument
-- version, which no longer exists. Repointed rather than left to fail at
-- runtime — a function that only breaks when someone calls it is worse than
-- one that was never there.
create or replace function public.confirm_etransfer_payment(
  _payment_id uuid,
  _amount_cents integer,
  _note text default null
) returns boolean
language sql
security definer
set search_path = public
as $$
  select public.confirm_offline_payment(_payment_id, _amount_cents, _note, null);
$$;
