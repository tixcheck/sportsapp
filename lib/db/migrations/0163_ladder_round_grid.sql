-- Which of BVL's grids a round league plays (lib/scheduler/bvl-round.ts).
--
--   'bvl'  — the Women's sheet: a 6-team tier plays 18 games over the round,
--            three pairings as red one-game halves (default; Women's).
--   'once' — a 6-team tier plays everyone once: 3 slots in week 1, 2 in
--            week 2 (BVL Reverse 4s — Indru, 2026-10-10: "6 team tier will
--            play all other teams once (one double, one triple)").
-- 4- and 5-team tiers play the same grids under both.

alter table "league_settings"
  add column if not exists "ladder_round_grid" text not null default 'bvl';
--> statement-breakpoint
do $$ begin
  alter table "league_settings"
    add constraint "league_settings_ladder_round_grid_check"
    check ("ladder_round_grid" in ('bvl', 'once'));
exception when duplicate_object then null;
end $$;
