-- Ladder format (docs/plans/ladder-league.md).
--
-- A ladder league is NOT a pre-generated round robin. Each tier plays among
-- itself weekly and teams swap between tiers on that night's results, so only
-- the calendar exists up front — matchups are drawn a week at a time.
--
-- ladder_swaps holds the exchange count per BOUNDARY, top-down: index i is the
-- number of teams traded between tier i and tier i+1. The exchange is balanced
-- by construction (n up always means n down), which is what keeps tier sizes
-- constant for the whole season. There is deliberately no separate "up" and
-- "down" setting — an unbalanced exchange would drift tier sizes every week.

alter table "league_settings"
  add column if not exists "ladder_enabled" boolean not null default false;
--> statement-breakpoint
alter table "league_settings"
  add column if not exists "ladder_unit" text not null default 'sets';
--> statement-breakpoint
alter table "league_settings"
  add column if not exists "ladder_target" integer not null default 6;
--> statement-breakpoint
alter table "league_settings"
  add column if not exists "ladder_swaps" jsonb;
--> statement-breakpoint

alter table "league_settings"
  add constraint "league_settings_ladder_unit_check"
  check ("ladder_unit" in ('sets', 'games'));
--> statement-breakpoint
alter table "league_settings"
  add constraint "league_settings_ladder_target_check"
  check ("ladder_target" between 1 and 40);
--> statement-breakpoint

-- Which tier a team sat in, week by week. Next week's draw reads the latest
-- rows; the season's story ("started Tier 3, finished Tier 1") reads all of
-- them. Deleting a week's rows is what makes a mis-locked week undoable.
create table if not exists "ladder_placements" (
  "id" uuid primary key default gen_random_uuid() not null,
  "competition_id" uuid not null references "competitions"("id") on delete cascade,
  "team_id" uuid not null references "teams"("id") on delete cascade,
  "division_id" uuid not null references "divisions"("id") on delete cascade,
  "week" integer not null,
  "position" integer not null default 0,
  "created_at" timestamptz not null default now()
);
--> statement-breakpoint

-- A team sits in exactly one tier per week.
alter table "ladder_placements"
  add constraint "ladder_placements_team_week_key" unique ("team_id", "week");
--> statement-breakpoint

create index if not exists "ladder_placements_competition_week_idx"
  on "ladder_placements" ("competition_id", "week");
--> statement-breakpoint

alter table "ladder_placements" enable row level security;
--> statement-breakpoint

-- Placements are as public as the competition itself: a player needs to see
-- which tier they're in, and the public league page shows the ladder.
create policy "ladder_placements_select" on "ladder_placements"
  for select using (public.can_view_competition("competition_id"));
--> statement-breakpoint

-- Only the competition's organizers write placements, and only through the
-- lock-week action. No player-facing write path exists.
create policy "ladder_placements_write" on "ladder_placements"
  for all to authenticated
  using (public.is_competition_admin("competition_id"))
  with check (public.is_competition_admin("competition_id"));
