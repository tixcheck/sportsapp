-- Whether a session ends in a playoff night.
--
-- Big Shoots, 2026-10-08: "we don't like the playoff format, guys just prefer
-- that its the same as the other weeks and then the winner is just the
-- cumulative points over the miniseries … we just keep the standings the
-- exact way that it is and add the 3rd week. At the end of the 3rd week the
-- winning players in week 3 should get the PO W … if there is a tie, it goes
-- head to head and then 2nd tie goes to points difference … series 1 stays as
-- is."
--
-- `session_playoff` (default true — every league as it is today). Off:
--   * the session's last night is a normal night and counts in the series
--     table (lib/schedule/sessions.ts `miniSeries`);
--   * the series winner is the top of that table once every night is scored,
--     and the PO W goes to the players who played its last night for that
--     team (lib/queries/player-stats.ts);
--   * the organizer isn't offered a playoff to draw.
-- A night that actually held a playoff stays one either way (Series 1).
--
-- Also tracked in settings history (0154).

alter table "league_settings"
  add column if not exists "session_playoff" boolean not null default true;
--> statement-breakpoint
comment on column "league_settings"."session_playoff" is
  'Whether each session ends in a playoff night (0160). Off: every night counts toward the series and its table decides the winner.';
--> statement-breakpoint

drop trigger if exists settings_history on league_settings;
--> statement-breakpoint
create trigger settings_history after update on league_settings
  for each row execute function public.trg_record_settings_change(
    'registration_open', 'registration_deadline', 'max_teams', 'blackout_dates',
    'weekly_slots', 'tiebreaker', 'ladder_swaps', 'wave_swap_weeks', 'session_nights',
    'session_playoff'
  );
