-- Who actually played, on which night, for which team.
--
-- Opt-in per competition (`track_appearances`), off by default. A 2s league
-- where a team IS its two players gains nothing from this and should not have
-- to record it; a drafted 6s league where people miss weeks and subs fill in
-- cannot be scored correctly without it.
--
-- One record per player per MATCH, not per night. A player who arrives after
-- game two played four of the six, and per-night grain would either credit them
-- with sets they missed or lose the night entirely. The UI still works a night
-- at a time — it just writes several rows.
--
-- Absence is deliberately NOT stored here. A rostered player with no appearance
-- for a match did not play, and recording that as a row would mean carrying
-- negative facts that have to be kept in step with the roster every time it
-- changes. Planned absence — "I'm out next Tuesday, find a sub" — is a
-- different thing about the future and belongs with the sub pool.
--
-- `player_name` is denormalised on purpose. A sub may have no account at all,
-- and a season's record should still read after someone deletes theirs.

alter table "competitions"
  add column if not exists "track_appearances" boolean not null default false;
--> statement-breakpoint

comment on column "competitions"."track_appearances" is
  'When true, per-player stats come from match_appearances rather than from team rosters. For drafted leagues where people miss nights and subs fill in.';
--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_type where typname = 'appearance_role') then
    create type "appearance_role" as enum ('rostered', 'sub');
  end if;
end $$;
--> statement-breakpoint

create table if not exists "match_appearances" (
  "id" uuid primary key default gen_random_uuid(),
  -- The durable owner. Kept even though it is derivable from the match, so the
  -- table can be queried per competition without a join on every read.
  "competition_id" uuid not null references "competitions"("id") on delete cascade,
  "match_id" uuid not null references "matches"("id") on delete cascade,
  "team_id" uuid not null references "teams"("id") on delete cascade,
  -- Null for a sub with no account. `player_name` always carries who it was.
  "user_id" uuid references "users"("id") on delete set null,
  "player_name" text not null,
  "role" "appearance_role" not null default 'rostered',
  "created_at" timestamptz not null default now()
);
--> statement-breakpoint

alter table "match_appearances"
  add constraint "match_appearances_name_not_blank"
  check (length(btrim("player_name")) > 0);
--> statement-breakpoint

-- One appearance per person per match. A player cannot play twice in the same
-- game, and without this a double-tap in the UI would double their stats.
create unique index if not exists "match_appearances_unique_user"
  on "match_appearances" ("match_id", "user_id")
  where "user_id" is not null;
--> statement-breakpoint

-- Accountless subs are keyed by name instead, for the same reason.
create unique index if not exists "match_appearances_unique_guest"
  on "match_appearances" ("match_id", "team_id", lower(btrim("player_name")))
  where "user_id" is null;
--> statement-breakpoint

create index if not exists "match_appearances_competition_idx"
  on "match_appearances" ("competition_id");
--> statement-breakpoint

create index if not exists "match_appearances_match_idx"
  on "match_appearances" ("match_id");
--> statement-breakpoint

create index if not exists "match_appearances_user_idx"
  on "match_appearances" ("user_id") where "user_id" is not null;
--> statement-breakpoint

alter table "match_appearances" enable row level security;
--> statement-breakpoint

-- Readable by anyone who can read the competition: these feed the public stats
-- tab, and the row carries a display name and no contact details.
drop policy if exists "match_appearances_select" on "match_appearances";
--> statement-breakpoint
create policy "match_appearances_select" on "match_appearances"
  for select using (true);
--> statement-breakpoint

-- Written only by whoever may enter a score for that match. The organizer marks
-- the sheet; the same people who record what happened record who was there.
drop policy if exists "match_appearances_insert" on "match_appearances";
--> statement-breakpoint
create policy "match_appearances_insert" on "match_appearances"
  for insert to authenticated
  with check (public.can_enter_score("match_id"));
--> statement-breakpoint

drop policy if exists "match_appearances_update" on "match_appearances";
--> statement-breakpoint
create policy "match_appearances_update" on "match_appearances"
  for update to authenticated
  using (public.can_enter_score("match_id"))
  with check (public.can_enter_score("match_id"));
--> statement-breakpoint

drop policy if exists "match_appearances_delete" on "match_appearances";
--> statement-breakpoint
create policy "match_appearances_delete" on "match_appearances"
  for delete to authenticated
  using (public.can_enter_score("match_id"));
--> statement-breakpoint

comment on table "match_appearances" is
  'Who played for which team in which match. Drives per-player stats when competitions.track_appearances is on, and is the basis for sub tracking and the who-has-played-with-whom matrix.';
