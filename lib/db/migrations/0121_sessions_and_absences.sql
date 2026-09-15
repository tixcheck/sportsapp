-- Sessions, and who was missing on the night.
--
-- Big Shoots runs its season as three-week sessions: the same drafted players
-- for two regular Fridays and a playoff Friday, then everyone is re-drafted.
-- Its organizer asked for two numbers per player — games won on playoff
-- nights, and how many times a sub had to be found for them. Neither could be
-- answered: nothing said which nights were playoffs, and nothing recorded who
-- was ABSENT, only who played.


-- 1. Nights per session ----------------------------------------------------
--
-- Every Nth played night is a playoff night. Counted over nights the league
-- actually plays, not calendar weeks, so a blacked-out holiday produces no
-- night and cannot knock the sessions out of step.
--
-- Null for every league that has no sessions, which is all of them but one —
-- a default of 3 would hand BVL a "playoff" every third week.
alter table "league_settings"
  add column if not exists "session_nights" integer;
--> statement-breakpoint

do $$ begin
  alter table "league_settings"
    add constraint "league_settings_session_nights_range"
    -- A one-night session would make every night a playoff, which is no rule.
    check ("session_nights" is null or "session_nights" between 2 and 20);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

comment on column "league_settings"."session_nights" is
  'Nights per session: every Nth played night is a playoff night. Null = the league has no sessions.';
--> statement-breakpoint


-- 2. Absences --------------------------------------------------------------
--
-- A saved lineup has only ever recorded who PLAYED. A rostered player left out
-- simply had no row, and in a league that re-drafts every three weeks their
-- team changes too — so once the roster moved on, "was X supposed to be there
-- that night?" had no answer at all.
--
-- A separate table rather than an 'absent' role on match_appearances: every
-- consumer of that table counts a row as a player on court, and an absent
-- player would be silently credited with sets across stats, partnerships and
-- the lineup screen.
--
-- Same grain as match_appearances (per match), written alongside it by the
-- same save. A player who misses one game of three is not a missed night —
-- the stat reads nights, and the grain keeps that distinction possible.
create table if not exists "match_absences" (
  "id" uuid primary key default gen_random_uuid(),
  "competition_id" uuid not null references "competitions"("id") on delete cascade,
  "match_id" uuid not null references "matches"("id") on delete cascade,
  "team_id" uuid not null references "teams"("id") on delete cascade,
  -- Null for a drafted player with no account. `player_name` always says who.
  "user_id" uuid references "users"("id") on delete set null,
  "player_name" text not null,
  "created_at" timestamptz not null default now()
);
--> statement-breakpoint

do $$ begin
  alter table "match_absences"
    add constraint "match_absences_name_not_blank"
    check (length(btrim("player_name")) > 0);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

create unique index if not exists "match_absences_unique_user"
  on "match_absences" ("match_id", "user_id")
  where "user_id" is not null;
--> statement-breakpoint

create unique index if not exists "match_absences_unique_guest"
  on "match_absences" ("match_id", "team_id", lower(btrim("player_name")))
  where "user_id" is null;
--> statement-breakpoint

create index if not exists "match_absences_competition_idx"
  on "match_absences" ("competition_id");
--> statement-breakpoint

create index if not exists "match_absences_match_idx"
  on "match_absences" ("match_id");
--> statement-breakpoint

alter table "match_absences" enable row level security;
--> statement-breakpoint

-- NOT public, unlike appearances. Who played is the scoresheet; who didn't turn
-- up is between a player and their organizer, and a public "missed" count
-- would publish attendance nobody agreed to share.
--
-- `can_enter_score` is included so whoever records a lineup can also clear it:
-- a DELETE only reaches rows its SELECT policy lets it see, and a scorer who
-- could write absences but not read them would leave old ones behind forever.
drop policy if exists "match_absences_select" on "match_absences";
--> statement-breakpoint
create policy "match_absences_select" on "match_absences"
  for select to authenticated
  using (
    public.is_competition_admin("competition_id")
    or public.can_enter_score("match_id")
  );
--> statement-breakpoint

drop policy if exists "match_absences_insert" on "match_absences";
--> statement-breakpoint
create policy "match_absences_insert" on "match_absences"
  for insert to authenticated
  with check (public.can_enter_score("match_id"));
--> statement-breakpoint

drop policy if exists "match_absences_update" on "match_absences";
--> statement-breakpoint
create policy "match_absences_update" on "match_absences"
  for update to authenticated
  using (public.can_enter_score("match_id"))
  with check (public.can_enter_score("match_id"));
--> statement-breakpoint

drop policy if exists "match_absences_delete" on "match_absences";
--> statement-breakpoint
create policy "match_absences_delete" on "match_absences"
  for delete to authenticated
  using (public.can_enter_score("match_id"));
--> statement-breakpoint

comment on table "match_absences" is
  'Rostered players left out of a saved lineup, per match. Organizer-only. Drives the Missed stat — nights a sub had to be found.';
