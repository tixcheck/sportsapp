-- Payments Slice A — organizer payouts onboarding (Stripe Connect Express).
--
-- One connected account per org PER STRIPE MODE. A test-mode acct_ id is not
-- usable with live keys, so (org_id, livemode) is the identity: the test row and
-- the live row coexist and go-live becomes a key swap, not a data migration.
--
-- We store Stripe ids + capability flags only. No card data, no bank details —
-- those live at Stripe and reach us as booleans. requirements_due_count is a
-- COUNT deliberately: the requirement details name people and carry PII we have
-- no reason to hold.
--
-- Writes: never from the browser. Organizer-initiated linking goes through
-- link_payment_account (SECURITY DEFINER, org-admin gated) so the app keeps
-- using the publishable key; the account.updated webhook is a trusted server
-- job and writes with the Supabase secret key after verifying Stripe's
-- signature. Hence: a SELECT policy and nothing else.

create table "payment_accounts" (
  "id" uuid primary key default gen_random_uuid() not null,
  "org_id" uuid not null references "organizations"("id") on delete cascade,
  "stripe_account_id" text not null unique,
  "livemode" boolean not null default false,
  "charges_enabled" boolean not null default false,
  "payouts_enabled" boolean not null default false,
  "details_submitted" boolean not null default false,
  "disabled_reason" text,
  "requirements_due_count" integer not null default 0,
  "country" text not null default 'CA',
  "default_currency" text not null default 'cad',
  "onboarded_at" timestamptz,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
--> statement-breakpoint

alter table "payment_accounts"
  add constraint "payment_accounts_org_livemode_key" unique ("org_id", "livemode");
--> statement-breakpoint

create index "payment_accounts_org_id_idx" on "payment_accounts" ("org_id");
--> statement-breakpoint

alter table "payment_accounts" enable row level security;
--> statement-breakpoint

-- Only the org's own admins (and the platform admin) can see where an org gets
-- paid. Players and co-organizers have no business reading it.
create policy "payment_accounts_select_org_admin" on "payment_accounts"
  for select to authenticated
  using (public.is_org_admin("org_id") or public.is_platform_admin());
--> statement-breakpoint

-- Link (or look up) an org's connected account for one Stripe mode.
--
-- Idempotent by design: if the org already has an account for this mode we
-- return the EXISTING stripe_account_id and ignore the one passed in. A double
-- click during onboarding must never orphan a half-verified Stripe account by
-- overwriting the row that points at it — the caller reuses what comes back and
-- generates a fresh onboarding link against it.
create or replace function public.link_payment_account(
  _org_id uuid,
  _stripe_account_id text,
  _livemode boolean
)
returns text language plpgsql security definer set search_path = public as $$
declare
  _existing text;
begin
  if not public.is_org_admin(_org_id) then
    raise exception 'Only an organization admin can connect payouts.';
  end if;

  select stripe_account_id into _existing
  from payment_accounts
  where org_id = _org_id and livemode = _livemode;

  if _existing is not null then
    return _existing;
  end if;

  insert into payment_accounts (org_id, stripe_account_id, livemode)
  values (_org_id, _stripe_account_id, _livemode)
  on conflict ("org_id", "livemode") do nothing;

  -- Re-read: a concurrent call may have won the insert.
  select stripe_account_id into _existing
  from payment_accounts
  where org_id = _org_id and livemode = _livemode;

  return _existing;
end;
$$;
--> statement-breakpoint

grant execute on function public.link_payment_account(uuid, text, boolean) to authenticated;
