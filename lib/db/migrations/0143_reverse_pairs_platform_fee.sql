-- A flat platform fee for a Reverse Pairs pair: $2.
--
-- Reverse Pairs was priced like a tournament — a percentage (1%) of the entry,
-- so 80¢ on Helix's $80 pair. The owner set it on 2026-09-30: "set the platform
-- fee as $2/pair registration". A pair is the unit people register and pay as,
-- so a flat amount per pair is the natural rate, the way leagues are flat per
-- team. When the partners split the fee, each half carries half of it
-- (`platformFeeCentsFor` in lib/payments/platform-fee.ts).
--
-- A column on the singleton `platform_fee_settings` beside the other rates,
-- defaulted to the rate, so the one existing row picks it up and a waived
-- competition still zeroes it through WAIVED_PLATFORM_FEE_RATES.

alter table "platform_fee_settings"
  add column if not exists "reverse_pairs_per_pair_cents" integer not null default 200;
--> statement-breakpoint

do $$ begin
  alter table "platform_fee_settings"
    add constraint "platform_fee_settings_reverse_pairs_nonneg"
    check ("reverse_pairs_per_pair_cents" >= 0);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

comment on column "platform_fee_settings"."reverse_pairs_per_pair_cents" is
  'Reverse Pairs: flat platform fee per pair registration, in cents. Split across the partners when each pays their own share.';
