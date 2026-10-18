-- A third round grid: 'cycle' (lib/scheduler/bvl-round.ts, bvlCycle).
--
-- BVL Non-Spiking (Indru, 2026-10-18) plays a FOUR-week round, and its gyms
-- give each tier 2 or 3 rounds a night, so neither two-week grid fits. A
-- 'cycle' tier walks a fixed rotation straight through the round — as many
-- rotation rounds a night as that week's ladder_tier_nights slot times — for
-- 6-team tiers (standard rotation) and 7-team tiers (Indru's table, one team
-- sitting out each round).

alter table "league_settings"
  drop constraint if exists "league_settings_ladder_round_grid_check";
--> statement-breakpoint
alter table "league_settings"
  add constraint "league_settings_ladder_round_grid_check"
  check ("ladder_round_grid" in ('bvl', 'once', 'cycle'));
