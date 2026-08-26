-- Restore points: an undo for the operations that destroy many rows at once.
--
-- The audit trail (0085) records WHAT happened. This records enough to put it
-- back. They are deliberately separate: the audit is append-only history that
-- must never be mutated, this is recoverable state with a retention policy.
--
-- Owned by the ORG, not the competition. A restore point whose only owner is
-- the competition would cascade away the moment the competition is deleted —
-- which is one of the accidents worth surviving. `competition_id` is therefore
-- SET NULL, and the competition's name and slug are copied in so a row about a
-- deleted league still says which league.
--
-- That choice has a privacy cost: snapshots of a deleted league contain team
-- names, which are real people. So a snapshot orphaned by a deletion gets an
-- `expires_at`, and the daily cron purges it. Recoverable for a month, not
-- forever. An organizer can also purge immediately.
--
-- Two scopes, because the two have very different volumes:
--   * competition — the whole schedule, taken before a destructive schedule op
--   * match       — one match and its sets, taken before a score is overwritten
-- A full 60 KB copy on every score entry would fill the retention cap with
-- routine edits and evict the snapshots that actually matter, so they are
-- capped separately.

create table if not exists "restore_points" (
  "id" uuid primary key default gen_random_uuid(),
  "org_id" uuid not null references "organizations"("id") on delete cascade,
  "competition_id" uuid references "competitions"("id") on delete set null,
  -- Copied in so an orphaned row still reads.
  "competition_name" text not null,
  "competition_slug" text not null,
  "scope" text not null,
  -- Set for a match-scoped point; informational only (the payload is the truth).
  "match_id" uuid,
  "reason" text not null,
  -- One human sentence, in the words an organizer would use.
  "label" text not null,
  "created_by_user_id" uuid references "users"("id") on delete set null,
  "match_count" integer not null default 0,
  "result_count" integer not null default 0,
  "payload" jsonb not null,
  -- Non-null only once the competition is gone: recoverable, then purged.
  "expires_at" timestamptz,
  "created_at" timestamptz not null default now()
);
--> statement-breakpoint

alter table "restore_points"
  add constraint "restore_points_scope_known"
  check ("scope" in ('competition', 'match'));
--> statement-breakpoint

alter table "restore_points"
  add constraint "restore_points_reason_known"
  check ("reason" in (
    'schedule_erased', 'schedule_redrawn', 'teams_added',
    'score_cleared', 'score_edited', 'before_restore'
  ));
--> statement-breakpoint

create index if not exists "restore_points_competition_idx"
  on "restore_points" ("competition_id", "scope", "created_at" desc);
--> statement-breakpoint

create index if not exists "restore_points_org_idx"
  on "restore_points" ("org_id", "created_at" desc);
--> statement-breakpoint

-- Purging expired rows is a scan the cron runs daily; keep it cheap.
create index if not exists "restore_points_expires_idx"
  on "restore_points" ("expires_at")
  where "expires_at" is not null;
--> statement-breakpoint

alter table "restore_points" enable row level security;
--> statement-breakpoint

-- Only org admins. A captain has no business reading a snapshot of the whole
-- league, and restoring is an organizer action by definition.
create policy "restore_points_select" on "restore_points"
  for select to authenticated using (public.is_org_admin("org_id"));
--> statement-breakpoint

create policy "restore_points_insert" on "restore_points"
  for insert to authenticated with check (public.is_org_admin("org_id"));
--> statement-breakpoint

-- Delete is allowed — unlike the audit log, this is disposable state, and an
-- organizer must be able to purge a deleted league's snapshot on request.
create policy "restore_points_delete" on "restore_points"
  for delete to authenticated using (public.is_org_admin("org_id"));
--> statement-breakpoint

-- No UPDATE policy: a restore point is written once and read back. Editing one
-- would mean restoring something that never existed.

comment on table "restore_points" is
  'Recoverable snapshots taken before destructive schedule and score changes. Org-owned so they survive competition deletion; orphaned rows carry expires_at and are purged by the daily cron.';
