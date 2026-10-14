-- Ladder weeks lock and draw themselves.
--
-- Owner, 2026-10-14: "why do an org have to click lock and draw new week? …
-- If all scores are entered, just lock and draw the next week's schedule."
-- A nightly job (app/api/cron/ladder-advance) now tries the same lock the
-- Ladder tab's button runs once a week's last night is over, and draws the
-- next week when it succeeds. The lock's own checks decide readiness: every
-- game scored, or a tier's standings typed in full; anything short of that is
-- refused and simply retried the next night.
--
-- On for every ladder league. Organizers can switch it off on the Ladder tab.

alter table "league_settings"
  add column if not exists "ladder_auto_advance" boolean not null default true;
