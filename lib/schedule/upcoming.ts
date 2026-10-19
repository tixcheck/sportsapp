import { DateTime } from "luxon";

/**
 * Whether a game still belongs in a player's "next" / "coming up" lists.
 *
 * Status alone isn't enough: BVL nights are often played on paper and never
 * scored in the app, so a game can stay `scheduled` long after its date — and
 * it used to show as "Your next game" ahead of tonight's real one (a 1★ review,
 * 2026-10-15). A game is upcoming while it's still to be played AND its day,
 * in the venue's timezone, is today or later — so tonight's game stays up
 * until midnight. An undated fixture (no time set yet) is still upcoming.
 */
export function isUpcoming(
  m: { status: string; scheduledAt: string | null; timezone: string },
  now: DateTime = DateTime.now(),
): boolean {
  if (m.status !== "scheduled" && m.status !== "in_progress") return false;
  if (!m.scheduledAt) return true;
  const day = DateTime.fromISO(m.scheduledAt, { zone: m.timezone }).startOf(
    "day",
  );
  return day >= now.setZone(m.timezone).startOf("day");
}
