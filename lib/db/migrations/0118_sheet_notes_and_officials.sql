-- The two things a printed score sheet carries that the app had nowhere to put.
--
-- Scarborough's gym package is not just a schedule. Most of the page is
-- standing instructions — what the winning team does with the nets, who sets
-- the clock, that an unfinished first game becomes a single-game match — plus
-- the names of the officials working that gym that night. Their executive's
-- test for the app is whether it prints the same sheet, so text that never
-- appears is a feature that does not exist.
--
-- Neither had a home. `competitions.description` is the organizer's pitch on
-- the REGISTRATION page, so putting gym rules there shows them to people
-- deciding whether to sign up. `venues.entry_notes` is directions to the
-- building. Both are the wrong audience.


-- 1. Standing instructions, as titled blocks --------------------------------
--
-- An array of {title, body} rather than one blob, because the sheet prints
-- them as separate headed sections and a single text field would make the
-- layout guess where one ends. Order is the array's order: it is a document,
-- and an organizer reordering sections means it.
--
-- PLAIN TEXT, like every other organizer-authored field in v0 (0074 says the
-- same of competition descriptions). Blank lines separate paragraphs.
alter table "league_settings"
  add column if not exists "sheet_notes" jsonb;
--> statement-breakpoint

comment on column "league_settings"."sheet_notes" is
  'Titled instruction blocks printed on every score sheet: [{title, body}]. Plain text. Null = none, which is every league that does not print sheets.';
--> statement-breakpoint

do $$ begin
  alter table "league_settings"
    add constraint "league_settings_sheet_notes_is_array"
    check ("sheet_notes" is null or jsonb_typeof("sheet_notes") = 'array');
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint


-- 2. Officials, per gym per night -------------------------------------------
--
-- Their sheets name PEOPLE — "#1 Ali Sharifalam, #2 Greg Horne" — and the app
-- only knows how to assign a ref TEAM. These are league volunteers who may not
-- have accounts and mostly never will, so a name is the whole record. Same
-- reasoning as match_appearances storing player_name: demanding an account
-- would mean the night simply goes unrecorded.
--
-- One row per (division, week): a gym on a night. Officials are ordered, since
-- the sheet numbers them #1/#2/#3 and that ordering is how the gym refers to
-- them.
create table if not exists "ladder_night_officials" (
  "id" uuid primary key default gen_random_uuid() not null,
  "competition_id" uuid not null references "competitions"("id") on delete cascade,
  "division_id" uuid not null references "divisions"("id") on delete cascade,
  "week" integer not null,
  -- ["Ali Sharifalam", "Greg Horne", "Cecil Clarke"]
  "officials" jsonb not null default '[]'::jsonb,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
--> statement-breakpoint

do $$ begin
  alter table "ladder_night_officials"
    add constraint "ladder_night_officials_division_week_key"
    unique ("division_id", "week");
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

do $$ begin
  alter table "ladder_night_officials"
    add constraint "ladder_night_officials_is_array"
    check (jsonb_typeof("officials") = 'array');
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

create index if not exists "ladder_night_officials_competition_week_idx"
  on "ladder_night_officials" ("competition_id", "week");
--> statement-breakpoint

comment on table "ladder_night_officials" is
  'Named officials working one gym on one night. Names, not accounts — league volunteers rarely have one, and requiring it would mean the night goes unrecorded.';
--> statement-breakpoint

alter table "ladder_night_officials" enable row level security;
--> statement-breakpoint

-- Readable by anyone who can see the competition: the sheet is handed out in
-- the gym, so who is officiating is not private.
create policy "ladder_night_officials_select" on "ladder_night_officials"
  for select to anon, authenticated
  using (true);
--> statement-breakpoint

create policy "ladder_night_officials_write" on "ladder_night_officials"
  for all to authenticated
  using (public.is_competition_admin("competition_id"))
  with check (public.is_competition_admin("competition_id"));
