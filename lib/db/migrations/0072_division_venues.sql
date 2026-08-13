-- Venues, slice two: which building a division plays in, and per-venue start
-- times.
--
-- Slice one (0071) made venues real and recorded them on matches, so an
-- existing schedule could be READ correctly. It did not teach the generator
-- anything: court assignment is still global across a night, and the whole
-- league shares one start time.
--
-- Two things change here.
--
--   1. `divisions.venue_id`. A division plays its night in ONE building — that
--      is how these leagues actually run, and it is what lets the generator
--      hand out courts per venue instead of from one global pool. Without it,
--      a 6-gym night would draw court numbers 1..N across buildings and
--      cheerfully put two games on the same physical court.
--
--   2. Per-venue start times, which need no DDL: `league_settings.weekly_slots`
--      is jsonb, so a slot gains an optional `venueId` and the league carries
--      one slot per venue. BVL's Thursday starts 6:00 at Jim Archdekin, 6:15 at
--      St. Augustine and 6:30 at Terry Miller; one start time for the night
--      cannot express that.
--
-- Null `venue_id` keeps meaning "the competition's single venue", so every
-- league that predates this is untouched and the generator's old behaviour is
-- preserved exactly.

alter table "divisions"
  add column "venue_id" uuid references "venues"("id") on delete set null;
--> statement-breakpoint

create index "divisions_venue_id_idx" on "divisions" ("venue_id")
  where "venue_id" is not null;
