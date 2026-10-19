-- Refuse to delete an event that still holds card money.
--
-- Every registration_payments row cascades away with its competition, and with
-- it the app's only Refund button. These are destination charges on the
-- PLATFORM's Stripe account, so the organizer can't refund them from her own
-- dashboard afterwards either. Helix, 2026-10-19: Dani wanted to cancel an
-- event that three pairs had paid for by card.
--
-- Live charges only: test-mode money isn't real, and test events must stay
-- deletable. Off-platform payments (cash, e-transfer, PayPal) don't block —
-- the organizer holds that money and returns it herself; the dialog says so.
create or replace function public.delete_competition(_competition_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  _unrefunded integer;
begin
  if not public.is_competition_org_admin(_competition_id) then
    raise exception 'not authorized to delete this competition';
  end if;

  select count(*) into _unrefunded
  from registration_payments
  where competition_id = _competition_id
    and method = 'card'
    and livemode
    and status in ('paid', 'refunded')
    and refunded_cents < total_cents;

  if _unrefunded > 0 then
    raise exception 'unrefunded card payments: %', _unrefunded;
  end if;

  delete from competitions where id = _competition_id;
end;
$$;
--> statement-breakpoint
grant execute on function public.delete_competition(uuid) to authenticated;
