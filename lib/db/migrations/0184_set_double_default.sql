-- 0184: both teams can default a single set (BVL, 2026-10-20: "both teams
-- came 15 mins late and defaulted the 1st set but completed the 2nd").
--
-- Stored as 0-0 with defaulted_by = 'both': no points and no set won for
-- either side, so the other set decides the game. When every set of a game is
-- 'both', the app also sets matches.double_default (a loss for each team).
alter table sets drop constraint if exists sets_defaulted_by_check;
alter table sets
  add constraint sets_defaulted_by_check
  check (defaulted_by in ('home', 'away', 'both'));
