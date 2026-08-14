-- Per-tier ladder settings.
--
-- The ladder engine was built on one assumption: every tier shares the night's
-- courts and its clock, so a "wave" is one round of simultaneous games across
-- the whole venue. That holds for a ladder run in a single gym on one timetable.
--
-- It does not hold for the shape organizers actually ask for. The Mango Sports
-- ladder is two independent single-court timelines:
--
--   Tier 1  3 teams   4 sets each   20-min sets   8:00-10:00   Court 1
--   Tier 2  4 teams   6 sets each   15-min sets   7:00-10:00   Court 2
--
-- Every one of those five things differs per tier, and `ladder_target`,
-- `minutes_per_game` and `weekly_slots[0].startTime` are all single league-wide
-- values. Rather than widen those (which would break every non-ladder league
-- reading them), each tier can now override them. Null means "use the league's
-- value", so every existing ladder keeps its current behaviour exactly.
--
-- `divisions.courts` already exists and already means "the courts this division
-- plays on", so court pinning needs no new column — only for the ladder draw to
-- start respecting it.

alter table "divisions"
  add column "ladder_target" integer;
--> statement-breakpoint

alter table "divisions"
  add column "minutes_per_set" integer;
--> statement-breakpoint

-- Local "HH:mm" in the competition's timezone. Null = the league's weekly slot.
alter table "divisions"
  add column "start_time" text;
--> statement-breakpoint

/*
 * How many opening slots this tier's TOP team sits out.
 *
 * The staggered start: the organizer rewards whoever finished top of the tier
 * with a later arrival. It is expressed in SLOTS rather than a clock time so it
 * survives a change to the set length — "skip the first four sets" stays
 * correct whether they are 15 or 20 minutes.
 *
 * It has a hard ceiling in the scheduling logic: a tier of n teams only has so
 * many sets that exclude one team, and asking for more than that is
 * unschedulable rather than merely tight.
 */
alter table "divisions"
  add column "late_start_slots" integer;
--> statement-breakpoint

alter table "divisions"
  add constraint "divisions_ladder_overrides_sane" check (
    ("ladder_target" is null or "ladder_target" between 1 and 40)
    and ("minutes_per_set" is null or "minutes_per_set" between 5 and 180)
    and ("late_start_slots" is null or "late_start_slots" between 0 and 40)
    and ("start_time" is null or "start_time" ~ '^[0-2][0-9]:[0-5][0-9]$')
  );
