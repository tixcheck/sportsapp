-- Gym permits: which gyms an organization has booked, on which night, for how
-- many courts and which hours, over which season — and the dates that differ.
--
-- BVL, 2026-10-07: the organizer sent their 2026/27 permit workbook (per night:
-- gym, courts, hours, the season's dates, cancellations colour-coded). The app
-- knew a gym's name and court count and nothing about WHEN it can be used, so a
-- schedule could be drawn on a cancelled night or before a gym opens. These two
-- tables hold the permit; the schedule builder reads them.
--
-- A PERMIT is the recurring booking: one gym, one weekday, a court set, a time
-- window, a date range. Jim Archdekin is two permits on a Tuesday — "Courts
-- A/B" 6-10 and "Court C" 8-10 — because that's how it's booked.
-- A permit DATE is an exception on one night: cancelled (incl. breaks), going
-- to be cancelled, cancellation requested, or different hours — each with the
-- organizer's note. A night with no row runs as permitted.
--
-- Readable by the org's members (the notes are internal — "Jenni wants to
-- cancel"), written by its admins, like venues.

create table if not exists "venue_permits" (
  "id" uuid primary key default gen_random_uuid(),
  "org_id" uuid not null references "organizations"("id") on delete cascade,
  "venue_id" uuid not null references "venues"("id") on delete cascade,
  -- 0 = Sunday … 6 = Saturday, as weekly_slots.dayOfWeek.
  "day_of_week" smallint not null check ("day_of_week" between 0 and 6),
  -- "Courts A/B", "Court C" — null when the permit is the whole booking.
  "label" text,
  "courts" integer not null check ("courts" > 0),
  -- Court labels as the gym names them; defaults to 1..courts in the app.
  "court_labels" text[],
  "start_time" time not null,
  "end_time" time not null check ("end_time" > "start_time"),
  "starts_on" date not null,
  "ends_on" date not null check ("ends_on" >= "starts_on"),
  -- What the permit is for, when the organizer says ("Pickup").
  "purpose" text,
  "source" text,
  "created_at" timestamptz not null default now()
);
--> statement-breakpoint
create index if not exists "venue_permits_org" on "venue_permits" ("org_id", "day_of_week");
--> statement-breakpoint

create table if not exists "venue_permit_dates" (
  "id" uuid primary key default gen_random_uuid(),
  "permit_id" uuid not null references "venue_permits"("id") on delete cascade,
  "on_date" date not null,
  "status" text not null check ("status" in
    ('cancelled', 'pending_cancel', 'cancel_requested', 'changed', 'available_note')),
  -- Only for 'changed': the hours that night instead of the permit's.
  "start_time" time,
  "end_time" time,
  "note" text,
  unique ("permit_id", "on_date"),
  check ("status" <> 'changed' or ("start_time" is not null and "end_time" is not null and "end_time" > "start_time"))
);
--> statement-breakpoint

alter table "venue_permits" enable row level security;
--> statement-breakpoint
alter table "venue_permit_dates" enable row level security;
--> statement-breakpoint

drop policy if exists "venue_permits_select" on "venue_permits";
--> statement-breakpoint
create policy "venue_permits_select" on "venue_permits"
  for select to authenticated using (public.is_org_member("org_id"));
--> statement-breakpoint
drop policy if exists "venue_permits_write" on "venue_permits";
--> statement-breakpoint
create policy "venue_permits_write" on "venue_permits"
  for all to authenticated
  using (public.is_org_admin("org_id"))
  with check (public.is_org_admin("org_id"));
--> statement-breakpoint

drop policy if exists "venue_permit_dates_select" on "venue_permit_dates";
--> statement-breakpoint
create policy "venue_permit_dates_select" on "venue_permit_dates"
  for select to authenticated using (
    exists (select 1 from venue_permits p where p.id = permit_id and public.is_org_member(p.org_id))
  );
--> statement-breakpoint
drop policy if exists "venue_permit_dates_write" on "venue_permit_dates";
--> statement-breakpoint
create policy "venue_permit_dates_write" on "venue_permit_dates"
  for all to authenticated
  using (exists (select 1 from venue_permits p where p.id = permit_id and public.is_org_admin(p.org_id)))
  with check (exists (select 1 from venue_permits p where p.id = permit_id and public.is_org_admin(p.org_id)));
