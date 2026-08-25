-- Make the match audit trail real, and make it outlive what it audits.
--
-- Two separate faults. The table has existed since 0000 and has never held a
-- single row, because no code path writes to it. And its `match_id` foreign key
-- cascades — so even if it had been written, deleting the matches would have
-- deleted their history along with them. On 2026-08-25 an organizer clicked
-- "Regenerate schedule" on Top Gun Summer 2026 and 82 fixtures with 157 sets
-- were deleted; the audit rows would have gone in the same statement. An audit
-- trail that dies with its subject is not an audit trail.
--
-- So:
--   * `match_id` becomes nullable and ON DELETE SET NULL. The row survives.
--   * `competition_id` is added and is the durable owner. It cascades, because
--     deleting a whole competition is a deliberate act that should take its
--     history with it — unlike redrawing a schedule, which should not.
--   * `detail` carries the scores and team NAMES at the time of the change, so
--     an orphaned row still says something a human can read after the teams,
--     matches and sets are gone.

alter table "match_audit"
  add column if not exists "competition_id" uuid;
--> statement-breakpoint

-- No rows exist, so backfill is a no-op — but do it properly anyway so this
-- migration is correct if it ever runs against a database that has some.
update "match_audit" a
   set "competition_id" = m."competition_id"
  from "matches" m
 where m."id" = a."match_id" and a."competition_id" is null;
--> statement-breakpoint

delete from "match_audit" where "competition_id" is null;
--> statement-breakpoint

alter table "match_audit"
  alter column "competition_id" set not null;
--> statement-breakpoint

alter table "match_audit"
  add constraint "match_audit_competition_id_fk"
  foreign key ("competition_id") references "competitions"("id")
  on delete cascade;
--> statement-breakpoint

-- The point of the whole migration: the trail must survive a match delete.
alter table "match_audit"
  drop constraint if exists "match_audit_match_id_matches_id_fk";
--> statement-breakpoint

alter table "match_audit"
  alter column "match_id" drop not null;
--> statement-breakpoint

alter table "match_audit"
  add constraint "match_audit_match_id_matches_id_fk"
  foreign key ("match_id") references "matches"("id")
  on delete set null;
--> statement-breakpoint

-- What happened, in a form code can filter on. `change_summary` stays as the
-- human sentence; this is the machine-readable companion.
alter table "match_audit"
  add column if not exists "action" text not null default 'score_changed';
--> statement-breakpoint

alter table "match_audit"
  add constraint "match_audit_action_known"
  check ("action" in (
    'score_submitted', 'score_confirmed', 'score_disputed', 'score_cleared',
    'schedule_redrawn', 'schedule_erased'
  ));
--> statement-breakpoint

-- Denormalised on purpose. A foreign key to teams would be null the moment the
-- teams are deleted, and "someone changed something" is not a trail.
alter table "match_audit"
  add column if not exists "detail" jsonb;
--> statement-breakpoint

create index if not exists "match_audit_competition_id_idx"
  on "match_audit" ("competition_id", "created_at" desc);
--> statement-breakpoint

-- RLS: the old policies keyed entirely off match_id, which is now nullable —
-- an orphaned row would match neither policy and become invisible to everyone,
-- which is precisely the row that matters most after a deletion.
drop policy if exists "match_audit_select" on "match_audit";
--> statement-breakpoint

create policy "match_audit_select" on "match_audit"
  for select using (
    public.is_competition_admin("competition_id")
    or (
      "match_id" is not null
      and (
        public.is_match_captain("match_id")
        or public.is_match_competition_admin("match_id")
      )
    )
  );
--> statement-breakpoint

drop policy if exists "match_audit_insert" on "match_audit";
--> statement-breakpoint

create policy "match_audit_insert" on "match_audit"
  for insert to authenticated
  with check (
    public.is_competition_admin("competition_id")
    or ("match_id" is not null and public.can_enter_score("match_id"))
  );
--> statement-breakpoint

-- Append-only: no update or delete policy exists, so nobody can rewrite or
-- quietly remove history through the API. Deliberate — a trail you can edit
-- proves nothing.
comment on table "match_audit" is
  'Append-only history of score and schedule changes. Survives deletion of the match it describes (match_id is SET NULL); competition_id is the durable owner.';
