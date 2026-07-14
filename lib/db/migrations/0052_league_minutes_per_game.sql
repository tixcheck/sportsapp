-- Configurable minutes-per-game for leagues. Spaces same-night games apart and
-- drives the schedule view's rest gaps. Existing leagues backfill to 45 (a
-- rec-league game); regenerate a schedule to apply the new spacing.
alter table league_settings
  add column if not exists minutes_per_game integer not null default 45;
