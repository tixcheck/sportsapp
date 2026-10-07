-- Which schedule views a league offers (By round, By date, By tier, By team,
-- By court, Matrix). Null = the default set, unchanged for every league.
--
-- Mango Sports, 2026-10-07: "The org said they dont need so many options. So
-- just for Mango League can you just keep it to by court and by tier option
-- only?" A list, not a flag, so the next org can choose its own pair. The
-- first entry is the view the schedule opens on. Applies to the organizer
-- page, the public page and the embed alike.

alter table "league_settings"
  add column if not exists "schedule_views" text[];
--> statement-breakpoint

do $$ begin
  alter table "league_settings"
    add constraint "league_settings_schedule_views_check"
    check (
      "schedule_views" is null
      or (cardinality("schedule_views") >= 1
          and "schedule_views" <@ array['round', 'date', 'tier', 'team', 'court', 'matrix']::text[])
    );
exception when duplicate_object then null;
end $$;
--> statement-breakpoint

comment on column "league_settings"."schedule_views" is
  'Schedule views offered, in order (first opens by default). Null = all that apply.';
