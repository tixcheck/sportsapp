-- The stats table says the same thing to everyone.
--
-- Owner: "I need the same stats displayed to the org to everyone else as well
-- even in public page."
--
-- 0121 made absences organizer-only on the reasoning that "who played is the
-- scoresheet; who didn't turn up is not". That was a defensible default and it
-- is being reversed deliberately, not by accident. The consequence, stated
-- plainly: a signed-out visitor can now see that a named player was rostered
-- and did not play. In a drafted rec league everybody on the night already
-- knows this, and the organizer is the one who decides what their league
-- publishes.
--
-- Why the policy has to change rather than the query: SECURITY DEFINER is not
-- available here (the app reads the table directly), and simply asking for
-- absences from the public page without this would return ZERO rows to a
-- non-admin. Every player would then read `Missed 0` — a perfect attendance
-- record that isn't one. A wrong number is worse than a hidden column, which
-- is exactly why the old code hid it.
--
-- Mirrors `match_appearances_select` (0089) exactly: `using (true)`, no role
-- restriction, because the public league page is mostly read by people with no
-- account. The row carries a display name and no contact details.

drop policy if exists "match_absences_select" on "match_absences";
--> statement-breakpoint

create policy "match_absences_select" on "match_absences"
  for select using (true);
--> statement-breakpoint

comment on table "match_absences" is
  'Rostered players left out of a saved lineup, per match. Publicly readable since 0135, like match_appearances — the Missed column reads the same for a visitor as for the organizer. Names only, never contact details.';
