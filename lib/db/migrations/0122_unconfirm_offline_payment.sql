-- Undo an offline payment confirmed by mistake.
--
-- Brampton's organizer: "I accidentally approved SERVES YOU RIGHT as PAID, but
-- they have not. How can I revert this? Should I click remove? Or would that
-- fuck things up further?" It would: Remove DELETES the team, and takes its
-- payment rows with it.
--
-- Nothing else could undo it either. `dismiss_offline_payment` (0119) refuses a
-- paid row on purpose, and the refund path needs a Stripe charge, which a
-- PayPal or e-transfer payment does not have — and a refund would be the wrong
-- record anyway: it says money went back, when none ever arrived.
--
-- So this is the exact reverse of `confirm_offline_payment`, and nothing more.

create or replace function public.unconfirm_offline_payment(
  _payment_id uuid,
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

  select * into _row from registration_payments
   where id = _payment_id for update;
  if not found then
    raise exception 'Unknown payment.';
  end if;

  -- A card charge was taken by Stripe and can only be reversed there; marking
  -- it unpaid here would leave the two disagreeing about real money.
  if _row.method = 'card' then
    raise exception 'That payment was taken by card.';
  end if;
  if not public.is_competition_admin(_row.competition_id) then
    raise exception 'Only the organizer can undo a confirmation.';
  end if;
  if _row.status <> 'paid' then
    -- Already undone, or never confirmed. Not an error worth showing twice to
    -- somebody who double-clicked.
    return false;
  end if;
  -- Undoing after the fee has been invoiced would quietly un-bill it.
  if _row.platform_fee_settled_at is not null then
    raise exception 'The platform fee on that payment has already been settled.';
  end if;
  -- A refund is a record of money going back. Undo says it never arrived; both
  -- cannot be true, and the refund is the one backed by a bank.
  if coalesce(_row.refunded_cents, 0) > 0 then
    raise exception 'That payment has a refund recorded — undo is not available.';
  end if;

  update registration_payments
     set status = 'pending',
         paid_at = null,
         confirmed_by_user_id = null,
         confirmed_reference = null,
         -- Why it was undone, in the place the confirmation note lived.
         confirmation_note = nullif(btrim(coalesce(_note, '')), ''),
         updated_at = now()
   where id = _payment_id;

  -- The amounts are deliberately left alone. Confirming overwrote the quote
  -- with what the organizer said arrived, and the original is not recoverable
  -- — re-confirming with the right figure, or a fresh request, restates it.

  -- Re-gate whatever the confirmation let through, and only that.
  if _row.free_agent_id is not null then
    select coalesce(cps.individual_fee_cents, 0) into _fee
      from competition_payment_settings cps
     where cps.competition_id = _row.competition_id;

    select coalesce(sum(rp.price_cents), 0) into _paid
      from registration_payments rp
     where rp.free_agent_id = _row.free_agent_id and rp.status = 'paid';

    if _fee > 0 and _paid < _fee then
      update free_agents set status = 'pending_payment', updated_at = now()
       where id = _row.free_agent_id and status = 'available';
    end if;
    return true;
  end if;

  select coalesce(cps.registration_fee_cents, 0) into _fee
    from competition_payment_settings cps
   where cps.competition_id = _row.competition_id;

  select coalesce(sum(rp.price_cents), 0) into _paid
    from registration_payments rp
   where rp.team_id = _row.team_id and rp.status = 'paid';

  -- Only puts back a payment hold. A team held for its roster or a waiver is
  -- already `pending_waiver` and is left exactly as it is — migration 0101 owns
  -- that gate, the same division of labour `confirm_offline_payment` observes.
  --
  -- A team the organizer deliberately admitted unpaid ("Admit anyway") also
  -- sits at `active`, and this cannot tell the two apart — it re-gates them,
  -- and the organizer admits them again. Re-admitting is one click; a team
  -- silently counted as paid is a hole in the books.
  if _fee > 0 and _paid < _fee then
    update teams set status = 'pending_payment'
     where id = _row.team_id and status = 'active';
  end if;

  return true;
end;
$$;
--> statement-breakpoint

revoke all on function public.unconfirm_offline_payment(uuid, text) from public;
--> statement-breakpoint

grant execute on function public.unconfirm_offline_payment(uuid, text) to authenticated;
--> statement-breakpoint

comment on function public.unconfirm_offline_payment(uuid, text) is
  'Reverse an offline payment confirmed in error: back to pending, and the team or free agent re-gated if that confirmation was what let them through. Refuses card charges, settled fees and refunded payments.';
