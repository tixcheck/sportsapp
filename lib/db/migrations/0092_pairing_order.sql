-- How a league's fixtures are ordered within a round.
--
-- The circle method spreads fixtures evenly and is the right default. It also
-- produces an order nobody would write by hand: for four teams it opens with
-- 1v4 and 3v2, and it rotates courts every round so no team lives on court 1.
-- Both behaviours exist for leagues where the courts differ in quality and the
-- printed order carries no meaning.
--
-- A drafted mini-series is the opposite case: four teams, one gym, two
-- identical courts, and a sheet pinned to the wall that the organizer wants to
-- read 1v2 / 1v3 / 1v4 down the page. 'sequential' gives exactly that — the
-- same round robin, listed the way he writes it, with courts pinned to the
-- listed order.
--
-- Existing leagues are unaffected: the column defaults to 'circle', which is
-- what the generator already did.

alter table "league_settings"
  add column if not exists "pairing_order" text not null default 'circle';
--> statement-breakpoint

alter table "league_settings"
  drop constraint if exists "league_settings_pairing_order_check";
--> statement-breakpoint

alter table "league_settings"
  add constraint "league_settings_pairing_order_check"
  check ("pairing_order" in ('circle', 'sequential'));
--> statement-breakpoint

comment on column "league_settings"."pairing_order" is
  'Fixture ordering within a round: circle (Berger tables, rotating courts) or sequential (first team fixed, courts pinned to the listed order).';
