-- An organizer recording a payment taken outside the app — cash at the door,
-- an e-transfer, PayPal, anything — with a note.
--
-- Helix, 2026-10-06: "wants to be able to mark them as paid by other means…
-- a small button with a text option to confirm the payment record that only
-- org is allowed to… she's collecting cash/etransfer or other means."
-- Confirming already existed, but only for a payment the PLAYER had started
-- (an e-transfer or PayPal they said they'd sent). A pair that never pressed
-- anything had nothing to confirm; the organizer's only tool was "Admit
-- anyway", which lets them in but leaves them owing in the books.
--
-- One paid row, method and note recorded, the organizer as confirmer. If the
-- team already has an offline payment waiting, that one is confirmed instead
-- of adding a second. Then the same promotion `confirm_offline_payment` does:
-- out of pending_payment once the fee is covered. On an org that recovers
-- platform fees (0151, Helix), the entry now owes its fee like any other
-- entry the platform never handled — `platform_fee_debts` already counts paid
-- non-card rows.

alter type payment_method add value if not exists 'cash';
--> statement-breakpoint
alter type payment_method add value if not exists 'other';
--> statement-breakpoint

create or replace function public.record_offline_payment(
  _team_id uuid,
  _method text,
  _amount_cents integer,
  _note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _comp uuid;
  _pending uuid;
  _fee integer;
  _paid integer;
begin
  if _uid is null then
    raise exception 'You need to be signed in.';
  end if;
  if _method not in ('cash', 'etransfer', 'paypal', 'other') then
    raise exception 'Unknown payment method.';
  end if;
  if _amount_cents is null or _amount_cents <= 0 then
    raise exception 'Enter the amount received.';
  end if;

  select competition_id into _comp from teams where id = _team_id;
  if _comp is null then
    raise exception 'Unknown team.';
  end if;
  if not public.is_competition_admin(_comp) then
    raise exception 'Only the organizer can record a payment.';
  end if;

  select id into _pending from registration_payments
   where team_id = _team_id and kind = 'team_full'
     and method <> 'card' and status = 'pending'
   limit 1;

  if _pending is not null then
    update registration_payments
       set status = 'paid', method = _method::payment_method,
           price_cents = _amount_cents, tax_cents = 0, total_cents = _amount_cents,
           paid_at = now(), confirmed_by_user_id = _uid,
           confirmation_note = nullif(btrim(coalesce(_note, '')), ''),
           updated_at = now()
     where id = _pending;
  else
    insert into registration_payments (
      competition_id, team_id, kind, status, method,
      price_cents, tax_cents, platform_fee_cents, total_cents, application_fee_cents,
      paid_at, confirmed_by_user_id, confirmation_note
    ) values (
      _comp, _team_id, 'team_full', 'paid', _method::payment_method,
      _amount_cents, 0, 0, _amount_cents, 0,
      now(), _uid, nullif(btrim(coalesce(_note, '')), '')
    );
  end if;

  select coalesce(cps.registration_fee_cents, 0) into _fee
    from competition_payment_settings cps where cps.competition_id = _comp;
  select coalesce(sum(price_cents), 0) into _paid
    from registration_payments where team_id = _team_id and status = 'paid';

  if _fee > 0 and _paid >= _fee then
    update teams set status = 'active' where id = _team_id and status = 'pending_payment';
    return true;
  end if;
  return false;
end;
$$;
--> statement-breakpoint

revoke all on function public.record_offline_payment(uuid, text, integer, text) from public;
--> statement-breakpoint
grant execute on function public.record_offline_payment(uuid, text, integer, text) to authenticated;
