-- How a ladder's season table is scored.
--
-- Until now there was one answer: `weightedStandings`, where a team earns its
-- tier's base plus points per set won, and the highest total tops the table.
-- That is Mango's Short Summer Season ("Tier 1 is 10 to play and 5 a set").
--
-- Their Fall season scores the opposite way. The organizer: "Top team will get
-- 1, 18th team will get 18. The more the points the lower they end up." Each
-- night a team scores its TIER'S NUMBER plus where it finished — 1/2/3 in Tier
-- 1, 4/5/6 in Tier 2, down to 16/17/18 in Tier 6 — and the LOWEST season total
-- wins. Sets won score nothing.
--
-- The two cannot be reconciled by choosing different numbers, because the
-- direction differs: under points-scoring, winning more sets raises your total,
-- which under placement-scoring would push you DOWN the table. So the league
-- says which it means.
--
-- Default 'points', so every existing league keeps the behaviour it has. Only a
-- league explicitly set to 'placement' scores the new way.
--
-- `divisions.weight_base` carries the tier's number in placement mode (what the
-- team finishing FIRST in that tier scores). `weight_per_set_win` is unused
-- there, and leaving it null is correct rather than a half-filled config —
-- which is what it looked like before this column existed.

alter table league_settings
  add column if not exists ladder_scoring text not null default 'points';
--> statement-breakpoint

do $$ begin
  alter table league_settings
    add constraint league_settings_ladder_scoring_check
    check (ladder_scoring in ('points', 'placement'));
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

comment on column league_settings.ladder_scoring is
  'points = tier base + points per set won, highest total wins (the original). placement = tier base + finishing position on the night, LOWEST total wins.';
