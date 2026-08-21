-- E-transfer payments, registration caps per tier, and the column that lets a
-- tier be pinned to a gym actually be set.
--
-- Three unrelated-looking changes that arrived in one conversation; kept
-- together because they're all "the organizer needs to say something the app
-- can't currently store".

-- ---------------------------------------------------------------------------
-- 1. E-transfer
-- ---------------------------------------------------------------------------
--
-- The money never touches Stripe: a player e-transfers the organizer directly
-- and the organizer confirms it arrived. That has two consequences.
--
-- First, a payment row can now exist with no Stripe account behind it, so
-- `stripe_account_id` stops being mandatory — guarded by a check so a CARD row
-- still can't be written without one.
--
-- Second, our platform fee can't be deducted from a payment we never handled.
-- The owner's decision (2026-08-21) is to record it as owed and settle it
-- separately, rather than waive it — waiving it would make e-transfer the
-- rational choice for every organizer and take card revenue with it. So the fee
-- is stored on the row exactly as it is for a card payment, and
-- `platform_fee_settled_at` tracks whether we've since collected it.

do $$ begin
  create type "payment_method" as enum ('card', 'etransfer');
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

alter table "registration_payments"
  add column if not exists "method" payment_method not null default 'card';
--> statement-breakpoint

-- Null until we invoice the organizer for the fee on an e-transfer. Always null
-- for card, where the fee was taken at the moment of the charge.
alter table "registration_payments"
  add column if not exists "platform_fee_settled_at" timestamptz;
--> statement-breakpoint

-- Who confirmed the transfer arrived, and anything they noted about it.
alter table "registration_payments"
  add column if not exists "confirmed_by_user_id" uuid
  references "users"("id") on delete set null;
--> statement-breakpoint

alter table "registration_payments"
  add column if not exists "confirmation_note" text;
--> statement-breakpoint

alter table "registration_payments"
  alter column "stripe_account_id" drop not null;
--> statement-breakpoint

do $$ begin
  alter table "registration_payments"
    add constraint "registration_payments_card_needs_account"
    check ("method" <> 'card' or "stripe_account_id" is not null);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

-- Where a player sends the money. Presence of this address IS the switch: an
-- organizer who hasn't given one isn't offering e-transfer, which avoids a
-- second flag that can disagree with it.
alter table "competition_payment_settings"
  add column if not exists "etransfer_email" text;
--> statement-breakpoint

do $$ begin
  alter table "competition_payment_settings"
    add constraint "competition_payment_settings_etransfer_email_shape"
    check (
      "etransfer_email" is null
      or "etransfer_email" ~ '^[^@[:space:]]+@[^@[:space:]]+$'
    );
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

-- Instructions shown beside the address ("put your team name in the message").
alter table "competition_payment_settings"
  add column if not exists "etransfer_note" text;
--> statement-breakpoint

do $$ begin
  alter table "competition_payment_settings"
    add constraint "competition_payment_settings_etransfer_note_len"
    check ("etransfer_note" is null or length("etransfer_note") <= 500);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

-- One open e-transfer per team, mirroring the card rule. Without it a captain
-- who clicks twice creates two pending obligations for the same fee.
create unique index if not exists "registration_payments_one_open_etransfer"
  on "registration_payments" ("team_id")
  where "method" = 'etransfer' and "kind" = 'team_full' and "status" = 'pending';
--> statement-breakpoint

create index if not exists "registration_payments_fee_owed_idx"
  on "registration_payments" ("competition_id")
  where "method" = 'etransfer'
    and "status" = 'paid'
    and "platform_fee_settled_at" is null;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Registration caps per tier
-- ---------------------------------------------------------------------------
--
-- `league_settings.max_teams` and `tournament_settings.max_teams` already cap a
-- competition. A tiered league also needs a cap per tier: six courts split
-- across three tiers is a limit on each, not just on the total.
--
-- Both caps apply. Whichever binds first closes registration for that choice.
alter table "divisions"
  add column if not exists "max_teams" integer;
--> statement-breakpoint

do $$ begin
  alter table "divisions"
    add constraint "divisions_max_teams_positive"
    check ("max_teams" is null or "max_teams" > 0);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Nothing new for tier venues — just a note
-- ---------------------------------------------------------------------------
--
-- `divisions.venue_id` already exists (migration 0072) and the league generator
-- already pins a tier's games to it. What was missing was any way for an
-- organizer to SET it; that's a UI gap, not a schema one, and is fixed in the
-- same change as this migration.
