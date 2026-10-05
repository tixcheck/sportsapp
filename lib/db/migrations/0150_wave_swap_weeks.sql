-- Swap a ladder's early and late waves every N weeks.
--
-- Mango Sports, Tuesdays (Coed Fall Season 7), 2026-10-05: "swap 7pm and 9pm
-- tiers every 3 weeks. It should start next week Oct 13." Tiers 1/3/5 play at
-- 19:00 and 2/4/6 at 21:00, each on its own court; every N weeks the two waves
-- trade start times so nobody is always on late. Courts don't change — only
-- which start time each tier draws with.
--
-- Counted in ladder WEEKS (the playing nights), not calendar weeks, so a
-- blackout Tuesday doesn't use up part of a block: weeks 1..N as configured,
-- N+1..2N swapped, and so on. For Mango, N = 3 makes week 4 — Oct 13 — the
-- first swapped night. Null = never swap (every other league).

alter table "league_settings"
  add column if not exists "wave_swap_weeks" integer;
--> statement-breakpoint

do $$ begin
  alter table "league_settings"
    add constraint "league_settings_wave_swap_weeks_positive"
    check ("wave_swap_weeks" is null or "wave_swap_weeks" > 0);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

comment on column "league_settings"."wave_swap_weeks" is
  'Per-tier ladder nights: every N ladder weeks the early and late start times trade places (weeks 1..N as set, N+1..2N swapped, …). Null = never.';
