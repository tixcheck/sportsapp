-- What happened on a ladder night, entered directly.
--
-- Until now the only way to move a ladder on was to enter every set of every
-- match: `rankLadderNight` derives the finishing order from results, and
-- `applyLadderMovement` takes that order. But the movement engine has never
-- wanted the scores — it takes `rankedTeamIds` and nothing else. The scores
-- were only ever a way of producing that list.
--
-- Scarborough Men's runs eight gyms a night off a paper sheet, and their
-- executive's objection to any system is that it adds work. Their organizer
-- was explicit: "for the app we don't need to input each score, just the final
-- standings at the end of the night." One line per team beats forty.
--
-- So a placement gains the night's OUTCOME beside the night's draw:
--
--   position      where the team sat in the tier when the week was drawn.
--                 Already here, and unchanged — it is an input, not a result.
--   result_rank   where they finished that night: 1 = won the gym.
--   result_points the Total Points column from their sheet.
--
-- Kept on `ladder_placements` rather than in a new table because the grain is
-- identical — one row per team per week — and a separate table would need the
-- same unique constraint, the same RLS and a join on every read to answer
-- "what happened to this team that week".
--
-- Both are NULLABLE, and that is the whole compatibility story: a league that
-- enters scores leaves them null and is ranked from its matches exactly as
-- before. A league that types the ranking fills them in and never records a
-- match. Nothing has to choose up front, and a league can do both — enter
-- scores most weeks and type the result for the night somebody forgot.
--
-- result_points is separate from the tier weighting added in 0115. That weights
-- a tier; this records what the organizer's own sheet said. Deriving one from
-- the other would mean telling an organizer their own total was wrong.

alter table "ladder_placements"
  add column if not exists "result_rank" integer;
--> statement-breakpoint

alter table "ladder_placements"
  add column if not exists "result_points" integer;
--> statement-breakpoint

comment on column "ladder_placements"."result_rank" is
  'Finishing position in the tier that night, 1 = best. Null means the night was not entered this way and ranking falls back to match results.';
--> statement-breakpoint

comment on column "ladder_placements"."result_points" is
  'Total points as recorded on the organizer''s own score sheet. Informational: movement uses result_rank.';
--> statement-breakpoint

-- A rank is a position in a list, so it starts at 1. Zero is the default for
-- `position` and would be an easy value to copy into the wrong column.
do $$ begin
  alter table "ladder_placements"
    add constraint "ladder_placements_result_rank_positive"
    check ("result_rank" is null or "result_rank" >= 1);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

do $$ begin
  alter table "ladder_placements"
    add constraint "ladder_placements_result_points_nonneg"
    check ("result_points" is null or "result_points" >= 0);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

-- Two teams cannot share a finishing position within one tier on one night.
-- Partial, so the many rows with no result do not collide with each other.
create unique index if not exists "ladder_placements_result_rank_unique"
  on "ladder_placements" ("competition_id", "division_id", "week", "result_rank")
  where "result_rank" is not null;
