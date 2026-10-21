-- 0183: record defaults (no-shows).
--
-- Per set: sets.defaulted_by = the side that defaulted that set. The set is
-- stored as the other side winning it to the target, 0 for the defaulter
-- (BVL, 2026-10-20), so every standings path reads it like any score; the
-- column only says why. A late team can default set 1 and play set 2.
--
-- Whole game, both teams: matches.double_default. No sets, a loss for each and
-- no points either way. Status stays 'completed'.
--
-- (A first draft put a default_side column on matches; nothing used it.)
alter table matches drop column if exists default_side;
alter table matches
  add column if not exists double_default boolean not null default false;
alter table sets
  add column if not exists defaulted_by text
  check (defaulted_by in ('home', 'away'));
