-- 0185: record a payment for an individual sign-up (BVL, 2026-10-21).
--
-- BVL adds INDY players by hand and takes their fee outside the app. Those
-- people have no payment row at all, so the PayPal / e-transfer inbox had
-- nothing to confirm and they sat at "Unpaid" with no way to fix it. This is
-- record_offline_payment (0152/0153) for a free agent: settle the open
-- offline request if there is one, else write a paid row; lift a payment hold
-- once the individual fee is covered. Organizer-only, checked here.
create or replace function public.record_individual_payment(
  _free_agent_id uuid,
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

  select competition_id into _comp from free_agents where id = _free_agent_id;
  if _comp is null then
    raise exception 'Unknown sign-up.';
  end if;
  if not public.is_competition_admin(_comp) then
    raise exception 'Only the organizer can record a payment.';
  end if;

  select coalesce(cps.individual_fee_cents, 0) into _fee
    from competition_payment_settings cps where cps.competition_id = _comp;
  select coalesce(sum(price_cents), 0) into _paid
    from registration_payments
   where free_agent_id = _free_agent_id and status = 'paid' and livemode = _livemode;
  if _fee > 0 and _paid >= _fee then
    raise exception 'This person has already paid in full.';
  end if;

  select id into _pending from registration_payments
   where free_agent_id = _free_agent_id and kind = 'individual'
     and method <> 'card' and status = 'pending'
   limit 1;

  if _pending is not null then
    update registration_payments
       set status = 'paid', method = _method::payment_method,
           price_cents = _amount_cents, tax_cents = 0, total_cents = _amount_cents,
           paid_at = now(), confirmed_by_user_id = _uid,
           confirmation_note = nullif(btrim(coalesce(_note, '')), ''),
           livemode = _livemode,
           updated_at = now()
     where id = _pending;
  else
    insert into registration_payments (
      competition_id, free_agent_id, kind, status, method,
      price_cents, tax_cents, platform_fee_cents, total_cents, application_fee_cents,
      paid_at, confirmed_by_user_id, confirmation_note, livemode
    ) values (
      _comp, _free_agent_id, 'individual', 'paid', _method::payment_method,
      _amount_cents, 0, 0, _amount_cents, 0,
      now(), _uid, nullif(btrim(coalesce(_note, '')), ''), _livemode
    );
  end if;

  select coalesce(sum(price_cents), 0) into _paid
    from registration_payments
   where free_agent_id = _free_agent_id and status = 'paid' and livemode = _livemode;

  if _fee > 0 and _paid >= _fee then
    update free_agents set status = 'available', updated_at = now()
     where id = _free_agent_id and status = 'pending_payment';
    return true;
  end if;
  return false;
end;
$$;
--> statement-breakpoint
revoke all on function public.record_individual_payment(uuid, text, integer, text, boolean) from public;
--> statement-breakpoint
grant execute on function public.record_individual_payment(uuid, text, integer, text, boolean) to authenticated;
