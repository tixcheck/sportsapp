-- Venues — a competition can run across several buildings on the same night.
--
-- Until now the model was one competition, one venue: `competitions.venue` is a
-- single text column, courts are a flat list of labels, and every scheduler and
-- view assumes one undifferentiated pool. That holds for a beach league in one
-- park. It does not hold for the indoor leagues this was built for, which run
-- 9 divisions across 6 school gyms simultaneously, each gym with its own
-- Court A/B/C.
--
-- Two consequences drove the shape here:
--
--   1. Court labels COLLIDE across venues. "Court A" exists at every gym, so a
--      label alone can no longer identify a court. The venue therefore has to
--      be recorded on the match itself, not inferred from the label.
--
--   2. Venues outlive competitions. An organizer books the same gyms season
--      after season, so venues hang off the ORG, not the competition. That is
--      what makes the address and the entry directions worth typing once.
--
-- `competitions.venue` is deliberately left alone. It stays the answer for a
-- single-site competition, and every competition that predates this keeps
-- working with no backfill: a null `matches.venue_id` means "wherever the
-- competition says".

create table "venues" (
  "id" uuid primary key default gen_random_uuid() not null,
  "org_id" uuid not null references "organizations"("id") on delete cascade,
  "name" text not null,
  -- Free text, shown to players and fed to a maps link.
  "address" text,
  -- "Enter through the East doors by the garbage bins. Park in the south lot."
  -- Printed on the public schedule, so it must NOT hold door codes or keys.
  "entry_notes" text,
  -- "Doors open at 6:05pm and 8:05pm" — the league prints this per gym.
  "doors_note" text,
  "created_at" timestamptz not null default now(),
  -- One "Terry Miller" per org. Re-adding an existing gym should be an edit,
  -- not a duplicate that splits a season's games across two rows.
  constraint "venues_name_per_org" unique ("org_id", "name"),
  constraint "venues_name_not_blank" check (btrim("name") <> '')
);
--> statement-breakpoint

create index "venues_org_id_idx" on "venues" ("org_id");
--> statement-breakpoint

alter table "venues" enable row level security;
--> statement-breakpoint

-- Readable by anyone, signed in or not. A public schedule has to be able to
-- tell a player which building to drive to, and most people reading one have no
-- account. Nothing here is private — it is the same information the league
-- already prints at the top of its spreadsheet.
create policy "venues_select" on "venues"
  for select using (true);
--> statement-breakpoint

-- Only the org's admins manage its venues.
create policy "venues_write" on "venues"
  for all to authenticated
  using (public.is_org_admin("org_id"))
  with check (public.is_org_admin("org_id"));
--> statement-breakpoint

-- Which building this game is in. Null = the competition's own `venue` field,
-- which is every match that existed before this migration.
--
-- `on delete set null` rather than cascade: deleting a venue must never delete
-- the games played there. The schedule falls back to the competition venue and
-- the organizer can re-point it.
alter table "matches"
  add column "venue_id" uuid references "venues"("id") on delete set null;
--> statement-breakpoint

create index "matches_venue_id_idx" on "matches" ("venue_id")
  where "venue_id" is not null;
