/**
 * One way to talk about a court.
 *
 * Courts used to be written two ways: the season generator stored
 * `"Court 10"` while the mid-season generator stored the bare `"10"` from the
 * league's `court_list`. A single league could hold both, which broke two
 * things quietly — prime-court balancing compared a stored `"Court 1"` against
 * a `court_list` label of `"1"` and never matched (so a team's prime history
 * looked empty), and the schedule grouped one physical court into two columns.
 *
 * The rule now: **store the bare label, format on the way out.** The stored
 * value matches `court_list` exactly, so comparisons are just string equality
 * after normalizing; the "Court " prefix is presentation and lives at the edge.
 *
 * Everything here tolerates the old prefixed rows, so it works before and after
 * any backfill.
 */

/**
 * The canonical, comparable form of a stored court value: `"Court 10"` → `"10"`,
 * `"court a"` → `"a"`, `"10"` → `"10"`. Null/blank stays null.
 */
export function normalizeCourtLabel(
  court: string | null | undefined,
): string | null {
  if (court == null) return null;
  const trimmed = court.trim();
  // A bare "Court " with nothing after it names no court.
  if (/^court$/i.test(trimmed)) return null;
  const stripped = trimmed.replace(/^court\s+/i, "").trim();
  return stripped.length > 0 ? stripped : null;
}

/**
 * How a court reads to a player: always "Court X". A label that already says
 * "Court" (a `court_list` entry may legitimately be `"Court A"`) is normalized
 * first, so this never produces "Court Court A".
 */
export function formatCourtLabel(
  court: string | null | undefined,
): string | null {
  const label = normalizeCourtLabel(court);
  return label == null ? null : `Court ${label}`;
}

/**
 * Whether two court values mean the same physical court, regardless of which
 * writer stored them. Case-insensitive so `"court a"` matches `"Court A"`.
 */
export function sameCourt(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeCourtLabel(a);
  const nb = normalizeCourtLabel(b);
  if (na == null || nb == null) return false;
  return na.toLowerCase() === nb.toLowerCase();
}
