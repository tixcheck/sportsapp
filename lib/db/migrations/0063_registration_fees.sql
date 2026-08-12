-- Payments Slice B — registration fee configuration.
--
-- Two tables, no money movement yet. `platform_fee_settings` holds the rates
-- the platform charges (admin-adjustable per the locked plan, so not
-- constants in code); `competition_payment_settings` holds what an organizer
-- charges for one event.
--
-- All amounts are integer CENTS. Currency is CAD platform-wide (locked
-- 2026-08-12) so there is deliberately no currency column.
--
-- Rates are read at quote time and the RESOLVED amount is stored on the
-- payment row later, so editing a rate never retroactively changes what
-- someone already paid.

create table "platform_fee_settings" (
  -- Singleton: the check constraint permits exactly one row.
  "id" boolean primary key default true,
  "tournament_percent" numeric(5,3) not null default 1.000,
  "league_per_player_cents" integer not null default 300,
  "league_per_team_cents" integer not null default 2000,
  "updated_at" timestamptz not null default now(),
  "updated_by" uuid references "users"("id") on delete set null,
  constraint "platform_fee_settings_singleton" check ("id"),
  constraint "platform_fee_settings_tournament_percent_range"
    check ("tournament_percent" >= 0 and "tournament_percent" <= 100),
  constraint "platform_fee_settings_per_player_nonneg"
    check ("league_per_player_cents" >= 0),
  constraint "platform_fee_settings_per_team_nonneg"
    check ("league_per_team_cents" >= 0)
);
--> statement-breakpoint

-- Seed the single row with the locked defaults: 1% tournaments, $3/player or
-- $20/team leagues.
insert into "platform_fee_settings" ("id") values (true);
--> statement-breakpoint

alter table "platform_fee_settings" enable row level security;
--> statement-breakpoint

-- Readable by any signed-in user: these rates are disclosed to the payer at
-- checkout anyway, and the organizer UI shows the breakdown before saving.
create policy "platform_fee_settings_select" on "platform_fee_settings"
  for select to authenticated using (true);
--> statement-breakpoint

-- Only the platform admin sets the platform's own prices.
create policy "platform_fee_settings_write" on "platform_fee_settings"
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
--> statement-breakpoint

create table "competition_payment_settings" (
  "competition_id" uuid primary key
    references "competitions"("id") on delete cascade,
  -- What the ORGANIZER NETS per team, not what the payer is charged. The
  -- payer's total is grossed up at quote time to cover Stripe + platform fee.
  "registration_fee_cents" integer not null default 0,
  "allow_captain_pays" boolean not null default true,
  "allow_split_payment" boolean not null default false,
  "tax_enabled" boolean not null default false,
  "tax_percent" numeric(5,3) not null default 0.000,
  -- Off by default: online payment is additive alongside cash/e-transfer,
  -- never a replacement (PRD §14).
  "payment_required" boolean not null default false,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "competition_payment_settings_fee_nonneg"
    check ("registration_fee_cents" >= 0),
  constraint "competition_payment_settings_tax_range"
    check ("tax_percent" >= 0 and "tax_percent" <= 100),
  -- A priced event nobody is allowed to pay for is a dead end. At least one
  -- payment mode must be open whenever there is a fee to collect.
  constraint "competition_payment_settings_mode_required"
    check (
      "registration_fee_cents" = 0
      or "allow_captain_pays"
      or "allow_split_payment"
    )
);
--> statement-breakpoint

alter table "competition_payment_settings" enable row level security;
--> statement-breakpoint

-- Anyone who can see the competition can see its price — a registrant needs to
-- know the cost before signing up, and the public registration page reads this.
create policy "competition_payment_settings_select" on "competition_payment_settings"
  for select using (public.can_view_competition("competition_id"));
--> statement-breakpoint

-- Only the competition's organizers set the price.
create policy "competition_payment_settings_write" on "competition_payment_settings"
  for all to authenticated
  using (public.is_competition_admin("competition_id"))
  with check (public.is_competition_admin("competition_id"));
