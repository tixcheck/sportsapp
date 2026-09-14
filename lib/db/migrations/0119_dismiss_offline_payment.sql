-- Clearing a registration nobody completed out of the organizer's inbox.
--
-- The offline payments inbox lists every `pending` non-card row, because those
-- are the ones an organizer has to go and check against their PayPal account.
-- It only ever offered "confirm". Somebody who started a registration, got a
-- payment request created and then walked away sat in that list for good, and
-- Brampton's secretary asked for exactly this: "remove incomplete registrations
-- so they don't appear under the paypal section".
--
-- No new status: `cancelled` has meant "payer abandoned checkout or the session
-- expired" since 0064, which is precisely this. What was missing is a way for
-- an organizer to say so. Writes go through a SECURITY DEFINER function because
-- `registration_payments` carries SELECT policies only — every write is a
-- function, deliberately, so money changes have one auditable door.


-- 1. The organizer's own dismissal ------------------------------------------

create or replace function public.dismiss_offline_payment(
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
begin
  if _uid is null then
    raise exception 'You need to be signed in.';
  end if;

  select * into _row from registration_payments
   where id = _payment_id for update;
  if not found then
    raise exception 'Unknown payment.';
  end if;

  -- A card charge is Stripe's to cancel; marking it here would leave the two
  -- disagreeing about whether money is still expected.
  if _row.method = 'card' then
    raise exception 'That payment was taken by card.';
  end if;
  if not public.is_competition_admin(_row.competition_id) then
    raise exception 'Only the organizer can dismiss a payment request.';
  end if;
  if _row.status = 'paid' then
    raise exception 'That payment is already confirmed. Refund it instead.';
  end if;
  if _row.status <> 'pending' then
    -- Already dismissed. Not an error worth showing twice to someone who
    -- double-clicked, but not a silent success either.
    return false;
  end if;

  update registration_payments
     set status = 'cancelled',
         confirmed_by_user_id = _uid,
         confirmation_note = nullif(btrim(coalesce(_note, '')), ''),
         updated_at = now()
   where id = _payment_id;

  -- The TEAM is deliberately left alone. Dismissing a payment request is not
  -- the same as removing an entry: the team stays `pending_payment` and stays
  -- on the organizer's Teams list, which is where it gets chased or withdrawn.
  -- `withdraw_team` and `remove_team` already exist for the other decision, and
  -- one button doing both would make a reversible act irreversible.
  --
  -- The partial unique index from 0102 only covers OPEN offline charges, so
  -- cancelling frees the team to be sent a fresh payment link.
  return true;
end;
$$;
--> statement-breakpoint

revoke all on function public.dismiss_offline_payment(uuid, text) from public;
--> statement-breakpoint

grant execute on function public.dismiss_offline_payment(uuid, text) to authenticated;
--> statement-breakpoint

comment on function public.dismiss_offline_payment(uuid, text) is
  'Organizer clears an uncompleted offline payment request. Leaves the team or free agent exactly as it was — this only empties the inbox row.';
--> statement-breakpoint


-- 2. Withdrawing somebody takes their payment request with them -------------
--
-- Brampton had a live example the day this was written: a free agent withdrawn
-- days earlier, whose $340 PayPal request was still sitting in the inbox
-- waiting to be confirmed. Nobody was ever going to pay it. Asking the
-- organizer to dismiss it by hand is asking them to clean up after the app.
--
-- A trigger rather than a change in the withdraw action, because withdrawal
-- happens from several places and this must hold for all of them.

create or replace function public.trg_cancel_payments_on_withdraw()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only ever touches a request nobody has paid. A `paid` row stays exactly as
  -- it is: money that arrived is a fact, and refunding it is a separate,
  -- deliberate act.
  update registration_payments
     set status = 'cancelled',
         updated_at = now()
   where status = 'pending'
     and method <> 'card'
     and (
       (tg_table_name = 'teams' and team_id = new.id)
       or (tg_table_name = 'free_agents' and free_agent_id = new.id)
     );
  return new;
end;
$$;
--> statement-breakpoint

drop trigger if exists "teams_withdraw_cancels_payments" on "teams";
--> statement-breakpoint

create trigger "teams_withdraw_cancels_payments"
  after update of status on "teams"
  for each row
  when (new.status = 'withdrawn' and old.status is distinct from 'withdrawn')
  execute function public.trg_cancel_payments_on_withdraw();
--> statement-breakpoint

drop trigger if exists "free_agents_withdraw_cancels_payments" on "free_agents";
--> statement-breakpoint

create trigger "free_agents_withdraw_cancels_payments"
  after update of status on "free_agents"
  for each row
  when (new.status = 'withdrawn' and old.status is distinct from 'withdrawn')
  execute function public.trg_cancel_payments_on_withdraw();
--> statement-breakpoint


-- 3. The rows already stranded ----------------------------------------------
--
-- The trigger only helps from here. Anyone withdrawn BEFORE it existed still
-- has an open request in the inbox — one in Brampton at the time of writing.
-- A pending charge against a withdrawn entry is not collectable by definition,
-- so this is a correction rather than a decision.
update registration_payments rp
   set status = 'cancelled',
       updated_at = now()
 where rp.status = 'pending'
   and rp.method <> 'card'
   and (
     exists (
       select 1 from teams t
        where t.id = rp.team_id and t.status = 'withdrawn'
     )
     or exists (
       select 1 from free_agents fa
        where fa.id = rp.free_agent_id and fa.status = 'withdrawn'
     )
   );
