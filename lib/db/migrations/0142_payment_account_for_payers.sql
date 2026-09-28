-- A player can see whether an organizer takes cards.
--
-- `payment_accounts` is readable only by the org's own admins (0060). Every
-- payer-facing read goes through `getPaymentAccount` as the PLAYER, so for
-- everyone but the organizer it came back empty: the team page hid "Pay by
-- card" behind "arrange payment with the organizer", and the checkout actions
-- refused with "This organizer hasn't set up card payments yet". Found on
-- 2026-09-28 setting up Helix's Reverse Pairs, and confirmed on the live data:
-- not one card registration has ever been paid, although MIH Volleyball has had
-- a fully enabled live account since August.
--
-- The table's policy stays admin-only — it is the organizer's settings row. This
-- function answers the one question a payer needs answered, "can this org take
-- my card, and to which account", for one org and one mode. It returns the
-- account id because a destination charge cannot be built without it; an
-- account id is inert without the platform's secret key, and it grants nothing
-- to read or write.

create or replace function public.org_payment_account(
  _org_id uuid,
  _livemode boolean
)
returns table (
  id uuid,
  stripe_account_id text,
  charges_enabled boolean,
  payouts_enabled boolean,
  details_submitted boolean,
  disabled_reason text,
  requirements_due_count integer,
  country text,
  default_currency text,
  onboarded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select pa.id, pa.stripe_account_id, pa.charges_enabled, pa.payouts_enabled,
         pa.details_submitted, pa.disabled_reason, pa.requirements_due_count,
         pa.country, pa.default_currency, pa.onboarded_at
    from payment_accounts pa
   where pa.org_id = _org_id
     and pa.livemode = _livemode
   limit 1;
$$;
--> statement-breakpoint

revoke all on function public.org_payment_account(uuid, boolean) from public;
--> statement-breakpoint

-- Signed-out visitors too: the public registration page says whether card
-- payment is available before anybody has an account.
grant execute on function public.org_payment_account(uuid, boolean)
  to anon, authenticated;
--> statement-breakpoint

comment on function public.org_payment_account(uuid, boolean) is
  'Whether an org can take card payments in this Stripe mode, and the connected account to route them to. Readable by payers; payment_accounts itself stays admin-only.';
