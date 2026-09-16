-- Save the playoff format instead of choosing it at the moment of generation.
--
-- Every control in the Generate-playoffs panel was local component state: who
-- advances, how many, a 3rd-place game, which courts. Nothing persisted, so the
-- format only existed in the head of whoever happened to click Generate.
--
-- That is a real problem for a competition with more than one division. Summer
-- Forever (Beach Barbiez) runs Mens and Womens with a Generate panel each, and
-- the organizer's requirement is that both have the SAME structure. With
-- nothing saved, that depends on somebody setting two panels identically on the
-- morning of the event — and the default (top 2 per pool) is a 6-team bracket
-- when what they want is all 12 in.
--
-- So it is stored per COMPETITION, not per division: one format, both brackets,
-- consistent by construction rather than by care.
--
-- `playoff_teams` already exists and carries N. What it MEANS depends on the
-- mode — 2 per pool vs 12 overall — which is why the mode has to be stored
-- beside it rather than inferred.

alter table tournament_settings
  add column if not exists playoff_advance_mode text
    check (playoff_advance_mode in ('perPool', 'overall'));
--> statement-breakpoint

alter table tournament_settings
  add column if not exists playoff_third_place boolean not null default false;
--> statement-breakpoint

-- Court numbers the bracket spreads its rounds across, e.g. [1,2,3,4,5,6,7,8].
-- Null = use every court the competition has, which is today's behaviour.
alter table tournament_settings
  add column if not exists playoff_courts jsonb;
--> statement-breakpoint

comment on column tournament_settings.playoff_advance_mode is
  'How playoff_teams is read: perPool = that many from each pool, overall = that many across the field. Null = not yet saved, and the panel falls back to its default.';
--> statement-breakpoint

comment on column tournament_settings.playoff_third_place is
  'Whether the bracket includes a 3rd-place game between the beaten semi-finalists.';
--> statement-breakpoint

comment on column tournament_settings.playoff_courts is
  'Court numbers the bracket is spread across, as a JSON array of ints. Null = all of the competition''s courts.';
