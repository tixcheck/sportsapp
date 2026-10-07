-- BVL's round format: a ladder whose cycle is N playing weeks, drawn a round
-- at a time on BVL's grids, with a gym plan per tier per week.
--
-- BVL (2026-10-07): "They do one round in two weeks. That means every team in
-- the tier plays against each other and then after that they are moved up
-- and down and then another round is generated." The ladder already locks,
-- moves teams and draws again — once a WEEK (SMVA). Here:
--
--   ladder_round_weeks   how many playing weeks make one round (BVL: 2). The
--                        lock only happens after the round's last week and
--                        ranks on all of its weeks' games.
--   ladder_draw          + 'bvl_round': draw every week of the round at once
--                        on BVL's grids (lib/scheduler/bvl-round.ts).
--   ladder_tier_nights   where and when each tier plays each week. BVL moves
--                        tiers between gyms week to week and puts two tiers
--                        in one gym one after the other (Aquinas: Tier B at
--                        6:15, Tier A at 8:10), so a tier's gym can't be a
--                        season-long property. A tier with no row for a week
--                        falls back to its division's gym and start time.

alter table "league_settings"
  add column if not exists "ladder_round_weeks" integer not null default 1;
--> statement-breakpoint

do $$ begin
  alter table "league_settings"
    add constraint "league_settings_ladder_round_weeks_check"
    check ("ladder_round_weeks" between 1 and 8);
exception when duplicate_object then null;
end $$;
--> statement-breakpoint

alter table "league_settings" drop constraint if exists "league_settings_ladder_draw_check";
--> statement-breakpoint
alter table "league_settings"
  add constraint "league_settings_ladder_draw_check"
  check ("ladder_draw" in ('generated', 'pod_grid', 'bvl_round'));
--> statement-breakpoint

create table if not exists "ladder_tier_nights" (
  "id" uuid primary key default gen_random_uuid(),
  "competition_id" uuid not null references "competitions"("id") on delete cascade,
  "division_id" uuid not null references "divisions"("id") on delete cascade,
  "week" integer not null check ("week" >= 1),
  "venue_id" uuid references "venues"("id") on delete set null,
  -- "HH:MM", one per grid slot, in order.
  "slot_times" text[] not null,
  -- Court labels in grid order; null = a, b, c.
  "court_labels" text[],
  "note" text,
  "created_at" timestamptz not null default now(),
  unique ("division_id", "week")
);
--> statement-breakpoint
create index if not exists "ladder_tier_nights_comp_week"
  on "ladder_tier_nights" ("competition_id", "week");
--> statement-breakpoint

alter table "ladder_tier_nights" enable row level security;
--> statement-breakpoint
drop policy if exists "ladder_tier_nights_read" on "ladder_tier_nights";
--> statement-breakpoint
create policy "ladder_tier_nights_read" on "ladder_tier_nights"
  for select using (public.can_view_competition(competition_id));
--> statement-breakpoint
drop policy if exists "ladder_tier_nights_write" on "ladder_tier_nights";
--> statement-breakpoint
create policy "ladder_tier_nights_write" on "ladder_tier_nights"
  for all to authenticated
  using (public.is_competition_admin(competition_id))
  with check (public.is_competition_admin(competition_id));
--> statement-breakpoint

comment on column "league_settings"."ladder_round_weeks" is
  'Playing weeks per ladder round (BVL: 2). The lock ranks on all of them and only after the last.';
