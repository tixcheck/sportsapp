-- How many courts a gym has.
--
-- Until now a court count lived only on the LEAGUE: `weekly_slots[].courts` as
-- one number for the whole competition, or a `court_list` whose entries each
-- carry a `venue_id`. Both describe one season's use of a building, so the same
-- facts were re-entered every time a league was set up. BVL rotate gyms week to
-- week across four leagues a season; the owner: "I want the org to be able to
-- add the total courts when adding a venue. So we dont need to have them add
-- them again in each and every league."
--
-- The count is a fact about the building, so it belongs on the building.
--
-- NULLABLE on purpose. Null means "not stated", which is every venue that
-- exists today, and the generator keeps falling back to the league's own number
-- exactly as before. A `not null default 1` would instead assert that twenty-odd
-- real gyms have a single court each — and the generator would believe it,
-- wrapping court numbers and double-booking a gym all night with a schedule
-- that looks fine (see `overCapacity` in lib/scheduler/tiered-league.ts).
--
-- It is a DEFAULT, never an override. A league's own court list still wins
-- where it exists: an org with a four-court gym may deliberately use two of
-- them on a Tuesday, and the league is where that gets said.

alter table venues add column if not exists courts integer;
--> statement-breakpoint

-- Guarded rather than plain: this migration is re-runnable, and `add
-- constraint` has no IF NOT EXISTS.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'venues_courts_sane'
  ) then
    alter table venues
      add constraint venues_courts_sane
      check (courts is null or (courts >= 1 and courts <= 40));
  end if;
end $$;
--> statement-breakpoint

comment on column venues.courts is
  'How many courts this building has. Null = not stated. A DEFAULT for leagues played here, never an override of the league''s own court_list.';
