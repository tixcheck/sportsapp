-- Payments Slice B2/B3 — what a team owes and what it has paid.
--
-- One row per payment. Captain-pays produces a single `team_full` row; a split
-- produces one `player_share` row per payer. Both shapes live in one table so
-- "is this team paid?" is a single question — are there unpaid rows — instead
-- of two code paths that can disagree.
--
-- Every amount is FROZEN when the row is created, resolved from the rates in
-- force at that moment. Platform rates are admin-editable, so recomputing a
-- historical payment from live rates would quietly rewrite what someone owed.
--
-- Writes: never from the browser. Rows are created by a SECURITY DEFINER
-- function the payer calls, and settled by the `checkout.session.completed`
-- webhook using the Supabase secret key after verifying Stripe's signature.
-- Hence a SELECT policy and nothing else.

create type "registration_payment_kind" as enum ('team_full', 'player_share');
--> statement-breakpoint

create type "registration_payment_status" as enum (
  'pending', 'paid', 'cancelled', 'refunded'
);
--> statement-breakpoint

create table "registration_payments" (
  "id" uuid primary key default gen_random_uuid() not null,
  "competition_id" uuid not null
    references "competitions"("id") on delete cascade,
  "team_id" uuid not null references "teams"("id") on delete cascade,
  "kind" registration_payment_kind not null,
  "status" registration_payment_status not null default 'pending',
  -- Which roster email this share belongs to. Null for a team_full charge.
  "payer_email" text,
  "payer_user_id" uuid references "users"("id") on delete set null,
  -- Organizer's net for THIS charge, excluding tax.
  "price_cents" integer not null,
  "tax_cents" integer not null default 0,
  "platform_fee_cents" integer not null,
  -- What the payer is charged.
  "total_cents" integer not null,
  -- What Stripe routes to the platform off the destination charge.
  "application_fee_cents" integer not null,
  "currency" text not null default 'cad',
  -- Mirrors payment_accounts: test and live rows must never be confused.
  "livemode" boolean not null default false,
  "stripe_account_id" text not null,
  "stripe_checkout_session_id" text unique,
  "stripe_payment_intent_id" text,
  "paid_at" timestamptz,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "registration_payments_amounts_nonneg" check (
    "price_cents" >= 0 and "tax_cents" >= 0 and "platform_fee_cents" >= 0
    and "total_cents" >= 0 and "application_fee_cents" >= 0
  ),
  -- The organizer's take is whatever we didn't. If these ever disagree, the
  -- money has gone somewhere nobody intended.
  constraint "registration_payments_total_balances" check (
    "total_cents" = "price_cents" + "tax_cents" + "application_fee_cents"
  ),
  -- A share belongs to somebody; a team charge belongs to the team.
  constraint "registration_payments_share_has_payer" check (
    "kind" <> 'player_share' or "payer_email" is not null
  ),
  constraint "registration_payments_paid_has_timestamp" check (
    "status" <> 'paid' or "paid_at" is not null
  )
);
--> statement-breakpoint

create index "registration_payments_team_idx"
  on "registration_payments" ("team_id");
--> statement-breakpoint

create index "registration_payments_competition_idx"
  on "registration_payments" ("competition_id");
--> statement-breakpoint

-- One open charge per payer per team. A double-clicked "Pay now" must reuse the
-- pending row rather than bill someone twice; the partial index lets settled
-- and abandoned rows accumulate without blocking a retry.
create unique index "registration_payments_one_open_team_charge"
  on "registration_payments" ("team_id")
  where "kind" = 'team_full' and "status" = 'pending';
--> statement-breakpoint

create unique index "registration_payments_one_open_share"
  on "registration_payments" ("team_id", "payer_email")
  where "kind" = 'player_share' and "status" = 'pending';
--> statement-breakpoint

alter table "registration_payments" enable row level security;
--> statement-breakpoint

-- The team's own members and the competition's organizers can see what is
-- owed and paid. Nobody else — a registration fee is between a team and its
-- organizer.
create policy "registration_payments_select" on "registration_payments"
  for select to authenticated
  using (
    public.is_competition_admin("competition_id")
    or exists (
      select 1 from public.team_members tm
      where tm.team_id = "registration_payments"."team_id"
        and tm.user_id = auth.uid()
    )
  );
--> statement-breakpoint

-- Create (or find) the open charge for a team paying in full.
--
-- Idempotent by design, mirroring link_payment_account: if an open charge
-- already exists we return the EXISTING row and ignore the session passed in.
-- A double-clicked "Pay now" must reuse the pending charge, never bill someone
-- a second time. The caller compares the returned session id with the one it
-- just created and expires its own if it lost the race.
--
-- Amounts are supplied by the caller and frozen here. They are recomputed
-- server-side from the same pure functions the UI quoted, so a tampered client
-- cannot set its own price -- but the authorization below is what actually
-- stops someone charging a team they have nothing to do with.
create or replace function public.start_registration_payment(
  _competition_id uuid,
  _team_id uuid,
  _kind registration_payment_kind,
  _payer_email text,
  _price_cents integer,
  _tax_cents integer,
  _platform_fee_cents integer,
  _total_cents integer,
  _application_fee_cents integer,
  _stripe_account_id text,
  _livemode boolean,
  _session_id text
)
returns text language plpgsql security definer set search_path = public as $$
declare
  _existing text;
begin
  -- A team's own members pay for it; organizers can pay on their behalf (an
  -- org-added team, or an organizer taking payment at the door).
  if not (
    public.is_competition_admin(_competition_id)
    or exists (
      select 1 from team_members tm
      where tm.team_id = _team_id and tm.user_id = auth.uid()
    )
  ) then
    raise exception 'Only the team or the organizer can pay this registration.';
  end if;

  -- The team must actually belong to this competition.
  if not exists (
    select 1 from teams t
    where t.id = _team_id and t.competition_id = _competition_id
  ) then
    raise exception 'That team is not in this competition.';
  end if;

  select stripe_checkout_session_id into _existing
  from registration_payments
  where team_id = _team_id
    and status = 'pending'
    and kind = _kind
    and (_kind = 'team_full' or payer_email = _payer_email);

  if _existing is not null then
    return _existing;
  end if;

  insert into registration_payments (
    competition_id, team_id, kind, payer_email,
    price_cents, tax_cents, platform_fee_cents,
    total_cents, application_fee_cents,
    stripe_account_id, livemode, stripe_checkout_session_id
  ) values (
    _competition_id, _team_id, _kind, _payer_email,
    _price_cents, _tax_cents, _platform_fee_cents,
    _total_cents, _application_fee_cents,
    _stripe_account_id, _livemode, _session_id
  )
  on conflict do nothing;

  -- Re-read: a concurrent call may have won the partial unique index.
  select stripe_checkout_session_id into _existing
  from registration_payments
  where team_id = _team_id
    and status = 'pending'
    and kind = _kind
    and (_kind = 'team_full' or payer_email = _payer_email);

  return _existing;
end;
$$;
--> statement-breakpoint

grant execute on function public.start_registration_payment(
  uuid, uuid, registration_payment_kind, text, integer, integer, integer,
  integer, integer, text, boolean, text
) to authenticated;
--> statement-breakpoint

-- Abandon an open charge whose Stripe session is no longer usable, so a fresh
-- one can be started. Only ever moves pending -> cancelled: a paid row must
-- never be reopened by anything except a refund.
create or replace function public.cancel_registration_payment(_session_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  _team uuid;
  _competition uuid;
begin
  select team_id, competition_id into _team, _competition
  from registration_payments
  where stripe_checkout_session_id = _session_id and status = 'pending';

  if _team is null then
    return false;
  end if;

  if not (
    public.is_competition_admin(_competition)
    or exists (
      select 1 from team_members tm
      where tm.team_id = _team and tm.user_id = auth.uid()
    )
  ) then
    raise exception 'Only the team or the organizer can cancel this charge.';
  end if;

  update registration_payments
  set status = 'cancelled', updated_at = now()
  where stripe_checkout_session_id = _session_id and status = 'pending';

  return true;
end;
$$;
--> statement-breakpoint

grant execute on function public.cancel_registration_payment(text) to authenticated;
