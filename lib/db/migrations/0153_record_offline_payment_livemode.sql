-- Fix 0152's record_offline_payment: payments recorded by the organizer were
-- invisible, and could be recorded twice.
--
-- Helix, 2026-10-06: Dani recorded Cristiane/Rafael's e-transfer and the
-- Payments tab still said $160 owing — so she pressed it again, twice. Every
-- payment read in the app is filtered to the deployment's Stripe mode
-- (`livemode`, see lib/queries/payments.ts), and 0152 never set it: the rows
-- took the column default, false, on a live deployment. Offline rows carry the
-- mode like card rows do (start_offline_payment sets it), so this takes it from
-- the app, as start_registration_payment does.
--
-- And once an entry's fee is covered, a second recording is refused rather
-- than stacked: three taps had recorded $240 against an $80 fee.

drop function if exists public.record_offline_payment(uuid, text, integer, text);
--> statement-breakpoint

create or replace function public.record_offline_payment(
  _team_id uuid,
  _method text,
  _amount_cents integer,
  _note text,
  _livemode boolean
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

  select coalesce(cps.registration_fee_cents, 0) into _fee
    from competition_payment_settings cps where cps.competition_id = _comp;
  select coalesce(sum(price_cents), 0) into _paid
    from registration_payments
   where team_id = _team_id and status = 'paid' and livemode = _livemode;
  if _fee > 0 and _paid >= _fee then
    raise exception 'This team has already paid in full.';
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
      paid_at, confirmed_by_user_id, confirmation_note, livemode
    ) values (
      _comp, _team_id, 'team_full', 'paid', _method::payment_method,
      _amount_cents, 0, 0, _amount_cents, 0,
      now(), _uid, nullif(btrim(coalesce(_note, '')), ''), _livemode
    );
  end if;

  select coalesce(sum(price_cents), 0) into _paid
    from registration_payments
   where team_id = _team_id and status = 'paid' and livemode = _livemode;

  if _fee > 0 and _paid >= _fee then
    update teams set status = 'active' where id = _team_id and status = 'pending_payment';
    return true;
  end if;
  return false;
end;
$$;
--> statement-breakpoint

revoke all on function public.record_offline_payment(uuid, text, integer, text, boolean) from public;
--> statement-breakpoint
grant execute on function public.record_offline_payment(uuid, text, integer, text, boolean) to authenticated;
