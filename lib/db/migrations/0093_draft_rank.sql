-- A player's strength within their own position, for the serpentine re-draft.
--
-- The Big Shoots organizer rebuilds his four teams after every playoff by
-- ranking each position and dealing them out so the ends cancel — team 1 takes
-- the 1st and the 8th outside, team 4 takes the 4th and the 5th. See
-- lib/draft/snake.ts for the rule.
--
-- That needs an ordering, and nothing in `free_agents` carried one:
-- `skill_level` has three buckets and every Big Shoots player is in the middle
-- one, which cannot separate ten outside hitters. This is the organizer's own
-- judgement, seeded from a season's stats once there is a season.
--
-- Nullable, because an unranked pool is the normal state before anyone has
-- played. `snakeDraft` falls back to list order for null ranks, so an unranked
-- pool still drafts rather than failing.
--
-- Deliberately NOT unique per (competition, position): the organizer types
-- these in and will briefly have two number 3s while reordering. A constraint
-- would reject the intermediate state of an ordinary edit.

alter table "free_agents"
  add column if not exists "draft_rank" integer;
--> statement-breakpoint

alter table "free_agents"
  drop constraint if exists "free_agents_draft_rank_positive";
--> statement-breakpoint

alter table "free_agents"
  add constraint "free_agents_draft_rank_positive"
  check ("draft_rank" is null or "draft_rank" > 0);
--> statement-breakpoint

comment on column "free_agents"."draft_rank" is
  'Strength within the player''s own position group; 1 is best. Null = unranked (drafts in list order). Organizer-set; see lib/draft/snake.ts.';
