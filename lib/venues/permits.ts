/**
 * Which courts an organization can use on a given date, from its gym permits
 * (0155). Pure — the schedule builder and the organizer's permit view both
 * read through this, so they can't disagree about a night.
 *
 * A permit runs on its weekday between `startsOn` and `endsOn`. A date row
 * overrides one night:
 *   cancelled        — not available (breaks, Holy Week, a cancelled booking)
 *   changed          — available, different hours that night
 *   pending_cancel   — still booked, but BVL is going to cancel it
 *   cancel_requested — still booked, cancellation asked for
 * The last two are AVAILABLE but flagged `atRisk`: until the cancellation
 * goes through the gym is ours, but a schedule shouldn't lean on it.
 */

export type PermitStatus =
  | "cancelled"
  | "pending_cancel"
  | "cancel_requested"
  | "changed"
  | "available_note";

export interface Permit {
  id: string;
  venueId: string;
  venueName: string;
  dayOfWeek: number; // 0 = Sunday
  label: string | null;
  courts: number;
  courtLabels: string[] | null;
  startTime: string; // "HH:MM" or "HH:MM:SS"
  endTime: string;
  startsOn: string; // "YYYY-MM-DD"
  endsOn: string;
}

export interface PermitDate {
  permitId: string;
  onDate: string;
  status: PermitStatus;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
}

export interface CourtWindow {
  permitId: string;
  venueId: string;
  venueName: string;
  label: string | null;
  courtLabels: string[];
  startTime: string; // "HH:MM"
  endTime: string;
  atRisk: boolean;
  note: string | null;
}

const hhmm = (t: string) => t.slice(0, 5);

/** Day of week for a calendar date, independent of the machine's timezone. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function courtsOnDate(
  permits: Permit[],
  dates: PermitDate[],
  date: string,
): CourtWindow[] {
  const dow = weekdayOf(date);
  const override = new Map(
    dates.filter((d) => d.onDate === date).map((d) => [d.permitId, d]),
  );
  const out: CourtWindow[] = [];
  for (const p of permits) {
    if (p.dayOfWeek !== dow) continue;
    if (date < p.startsOn || date > p.endsOn) continue;
    const o = override.get(p.id);
    if (o?.status === "cancelled") continue;
    const changed = o?.status === "changed" && o.startTime && o.endTime;
    out.push({
      permitId: p.id,
      venueId: p.venueId,
      venueName: p.venueName,
      label: p.label,
      courtLabels:
        p.courtLabels && p.courtLabels.length > 0
          ? p.courtLabels
          : Array.from({ length: p.courts }, (_, i) => String(i + 1)),
      startTime: hhmm(changed ? o.startTime! : p.startTime),
      endTime: hhmm(changed ? o.endTime! : p.endTime),
      atRisk:
        o?.status === "pending_cancel" || o?.status === "cancel_requested",
      note: o?.note ?? null,
    });
  }
  return out.sort(
    (a, b) =>
      a.startTime.localeCompare(b.startTime) ||
      a.venueName.localeCompare(b.venueName),
  );
}

/** Every date a permit's weekday falls on in its range, for a season view. */
export function permitNights(p: Permit): string[] {
  const out: string[] = [];
  const [y, m, d] = p.startsOn.split("-").map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  while (cur.getUTCDay() !== p.dayOfWeek) cur.setUTCDate(cur.getUTCDate() + 1);
  for (;;) {
    const iso = cur.toISOString().slice(0, 10);
    if (iso > p.endsOn) break;
    out.push(iso);
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return out;
}
