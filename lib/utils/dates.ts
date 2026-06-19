import { DateTime } from "luxon";

/**
 * A friendly date or date range from ISO date strings (YYYY-MM-DD), e.g.
 * "Aug 16, 2025" or "Aug 16–17, 2025". Null when there's no start date.
 */
export function formatDateRange(
  start: string | null | undefined,
  end?: string | null,
): string | null {
  if (!start) return null;
  const s = DateTime.fromISO(start);
  if (!s.isValid) return null;
  const e = end ? DateTime.fromISO(end) : null;
  if (!e || !e.isValid || e.hasSame(s, "day")) {
    return s.toFormat("LLL d, yyyy");
  }
  if (s.hasSame(e, "month")) {
    return `${s.toFormat("LLL d")}–${e.toFormat("d, yyyy")}`;
  }
  if (s.hasSame(e, "year")) {
    return `${s.toFormat("LLL d")} – ${e.toFormat("LLL d, yyyy")}`;
  }
  return `${s.toFormat("LLL d, yyyy")} – ${e.toFormat("LLL d, yyyy")}`;
}
