-- How a ladder league's weekly games are drawn.
--
-- Every ladder so far has had its night COMPUTED: `planTierNight` /
-- `planLadderWeek` split a target number of sets across a tier's pairings and
-- pack them onto courts. Scarborough Men's does not want that. Their grids are
-- the same every week and have been for years — same matchups, same courts,
-- same order — and the organizer was explicit that it "has to be this". The
-- grids are pinned as data in `lib/scheduler/pod-templates.ts`.
--
--   generated  the night is computed (every ladder before this; the default).
--   pod_grid   each tier plays the pinned grid for its size, teams bound to
--              letters A, B, C… in the order they sit in the tier that week.
--
-- A column rather than inferring it from "a template exists for this tier
-- size": Mango runs 4- and 6-team tiers too, and silently switching them onto
-- Scarborough's grids because the sizes happen to match would be exactly the
-- kind of quiet change neither organizer asked for.
--
-- A pod_grid league also ENTERS its nights differently — the final standings
-- per tier, not every score ("for the app we don't need to input each score,
-- just the final standings at the end of the night"). That entry uses
-- `ladder_placements.result_rank` (0117), which any ladder may use, so it needs
-- no column of its own. This one only decides the draw, and what the
-- organizer's panel offers first.

alter table "league_settings"
  add column if not exists "ladder_draw" text not null default 'generated';
--> statement-breakpoint

do $$ begin
  alter table "league_settings"
    add constraint "league_settings_ladder_draw_check"
    check ("ladder_draw" in ('generated', 'pod_grid'));
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

comment on column "league_settings"."ladder_draw" is
  'How a ladder night is drawn: generated (computed from the target) or pod_grid (the pinned grid in pod-templates.ts for each tier''s size).';
--> statement-breakpoint

-- Scarborough is the one league on pinned grids.
update "league_settings"
   set "ladder_draw" = 'pod_grid'
 where "competition_id" = (
   select "id" from "competitions"
    where "slug" = 'smva-monday-ladder-2026-2027'
 );
