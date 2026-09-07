-- Make the answer indexes usable by ON CONFLICT.
--
-- Migration 0104 made these PARTIAL — `where user_id is not null` — reasoning
-- that the constraint only applies to rows of that shape. Correct as a
-- constraint, and unusable as an arbiter: Postgres will not infer a partial
-- unique index from `on conflict (question_id, user_id)` unless the statement
-- repeats the index predicate, which PostgREST's upsert cannot emit. Every
-- attempt to save an answer failed with "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification", so no answer ever saved.
--
-- Dropping the predicate loses nothing. Unique indexes treat NULLs as distinct
-- by default, so `unique (question_id, user_id)` places no restriction at all
-- on team-scope rows, whose user_id is null — exactly what the predicate was
-- there to express. The rows that need constraining are constrained
-- identically, and now the index can be named as an arbiter.
--
-- The `registration_answers_one_subject` check still guarantees exactly one of
-- team_id and user_id is set, so neither index can be dodged by writing both.

drop index if exists "registration_answers_team_unique";
--> statement-breakpoint

drop index if exists "registration_answers_user_unique";
--> statement-breakpoint

create unique index if not exists "registration_answers_team_unique"
  on "registration_answers" ("question_id", "team_id");
--> statement-breakpoint

create unique index if not exists "registration_answers_user_unique"
  on "registration_answers" ("question_id", "user_id");
