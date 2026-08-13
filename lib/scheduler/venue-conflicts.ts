/**
 * What can go wrong once a competition spans buildings.
 *
 * Pure — no DB access — so it runs against a generated schedule, a hand-edited
 * one, or one imported from somebody's spreadsheet. That last case is the point:
 * these leagues have been building schedules by hand for years, and the mistakes
 * they make are invisible on a grid but obvious to whoever drives to the wrong
 * gym.
 *
 * Every check answers a question an organizer would otherwise only hear about
 * from an angry captain.
 */

import { normalizeCourtLabel } from "@/lib/scheduler/court-label";

export type AuditMatch = {
  id: string;
  /** ISO instant. Unscheduled games can't clash, so they're skipped. */
  scheduledAt: string | null;
  court: string | null;
  venueId: string | null;
  venueName?: string | null;
  divisionId?: string | null;
  divisionName?: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
};

export type VenueIssueKind =
  | "court_double_booked"
  | "team_double_booked"
  | "team_travels"
  | "division_split"
  | "venue_over_capacity";

export type VenueIssue = {
  kind: VenueIssueKind;
  /** Rendered straight into the UI — the check knows best how to say it. */
  summary: string;
  /** Matches involved, so the organizer can jump to them. */
  matchIds: string[];
  venueId?: string | null;
};

/** Courts available at each building, for the capacity check. */
export type VenueCapacityInput = { venueId: string | null; courts: number };

const dayOf = (iso: string) => iso.slice(0, 10);
const teamsOf = (m: AuditMatch) =>
  [m.homeTeamId, m.awayTeamId].filter(Boolean) as string[];
const venueLabel = (m: { venueName?: string | null }) =>
  m.venueName?.trim() || "an unnamed venue";

/**
 * Two games on the same court at the same moment.
 *
 * Keyed on venue AND court, because a court label alone stopped being unique
 * the moment a second building existed — every gym has a "Court A".
 */
function courtDoubleBookings(matches: AuditMatch[]): VenueIssue[] {
  const seen = new Map<string, AuditMatch[]>();
  for (const m of matches) {
    const label = normalizeCourtLabel(m.court);
    if (!m.scheduledAt || !label) continue;
    const key = `${m.venueId ?? ""}|${label.toLowerCase()}|${m.scheduledAt}`;
    const list = seen.get(key);
    if (list) list.push(m);
    else seen.set(key, [m]);
  }
  return [...seen.values()]
    .filter((ms) => ms.length > 1)
    .map((ms) => ({
      kind: "court_double_booked" as const,
      venueId: ms[0].venueId,
      summary: `${ms.length} games share Court ${normalizeCourtLabel(ms[0].court)} at ${venueLabel(ms[0])} at the same time.`,
      matchIds: ms.map((m) => m.id),
    }));
}

/** One team in two places at once. */
function teamDoubleBookings(matches: AuditMatch[]): VenueIssue[] {
  const seen = new Map<string, AuditMatch[]>();
  for (const m of matches) {
    if (!m.scheduledAt) continue;
    for (const t of teamsOf(m)) {
      const key = `${t}|${m.scheduledAt}`;
      const list = seen.get(key);
      if (list) list.push(m);
      else seen.set(key, [m]);
    }
  }
  const out: VenueIssue[] = [];
  const reported = new Set<string>();
  for (const [key, ms] of seen) {
    if (ms.length < 2) continue;
    const sig = ms
      .map((m) => m.id)
      .sort()
      .join(",");
    if (reported.has(sig)) continue;
    reported.add(sig);
    const teamId = key.slice(0, key.indexOf("|"));
    const name =
      ms[0].homeTeamId === teamId
        ? (ms[0].homeTeamName ?? "A team")
        : (ms[0].awayTeamName ?? "A team");
    out.push({
      kind: "team_double_booked",
      venueId: ms[0].venueId,
      summary: `${name} is scheduled for ${ms.length} games at the same time.`,
      matchIds: ms.map((m) => m.id),
    });
  }
  return out;
}

/**
 * A team playing in more than one building on the same night.
 *
 * Not necessarily a mistake — but it means somebody packs up and drives
 * mid-evening, which is never what an organizer intends and is invisible on a
 * per-venue sheet.
 */
function travellingTeams(matches: AuditMatch[]): VenueIssue[] {
  const byTeamDay = new Map<string, AuditMatch[]>();
  for (const m of matches) {
    if (!m.scheduledAt || !m.venueId) continue;
    for (const t of teamsOf(m)) {
      const key = `${t}|${dayOf(m.scheduledAt)}`;
      const list = byTeamDay.get(key);
      if (list) list.push(m);
      else byTeamDay.set(key, [m]);
    }
  }
  const out: VenueIssue[] = [];
  for (const [key, ms] of byTeamDay) {
    const venues = new Map(ms.map((m) => [m.venueId, venueLabel(m)]));
    if (venues.size < 2) continue;
    const teamId = key.slice(0, key.indexOf("|"));
    const first = ms[0];
    const name =
      first.homeTeamId === teamId
        ? (first.homeTeamName ?? "A team")
        : (first.awayTeamName ?? "A team");
    out.push({
      kind: "team_travels",
      summary: `${name} plays at ${venues.size} different venues on ${dayOf(first.scheduledAt!)} — ${[...venues.values()].join(" and ")}.`,
      matchIds: ms.map((m) => m.id),
    });
  }
  return out;
}

/**
 * A division whose games are spread across buildings ON ONE NIGHT.
 *
 * These leagues run a division as a block in one gym so its teams arrive and
 * leave together; a same-night split usually means a court was filed under the
 * wrong venue.
 *
 * Scoped to a single date on purpose. Rotating gyms week to week is normal and
 * deliberate — BVL's Division C1 plays Jim Archdekin one week and St. Marguerite
 * the next — so comparing across the whole season flags every well-run league in
 * the system. (It did: this check reported five false positives against the real
 * BVL schedule before it was scoped to the night.)
 */
function splitDivisions(matches: AuditMatch[]): VenueIssue[] {
  const byDivisionNight = new Map<string, AuditMatch[]>();
  for (const m of matches) {
    if (!m.divisionId || !m.venueId || !m.scheduledAt) continue;
    const key = `${m.divisionId}|${dayOf(m.scheduledAt)}`;
    const list = byDivisionNight.get(key);
    if (list) list.push(m);
    else byDivisionNight.set(key, [m]);
  }
  const out: VenueIssue[] = [];
  for (const ms of byDivisionNight.values()) {
    const venues = new Map(ms.map((m) => [m.venueId, venueLabel(m)]));
    if (venues.size < 2) continue;
    out.push({
      kind: "division_split",
      summary: `${ms[0].divisionName ?? "A division"} is split across ${venues.size} venues on ${dayOf(ms[0].scheduledAt!)} — ${[...venues.values()].join(", ")}.`,
      matchIds: ms.map((m) => m.id),
    });
  }
  return out;
}

/** More games at once than the building has courts. */
function overCapacity(
  matches: AuditMatch[],
  capacity: VenueCapacityInput[],
): VenueIssue[] {
  const courts = new Map(capacity.map((c) => [c.venueId ?? null, c.courts]));
  const bySlot = new Map<string, AuditMatch[]>();
  for (const m of matches) {
    if (!m.scheduledAt) continue;
    const key = `${m.venueId ?? ""}|${m.scheduledAt}`;
    const list = bySlot.get(key);
    if (list) list.push(m);
    else bySlot.set(key, [m]);
  }

  // Report the worst slot per venue, not every slot — six identical warnings
  // for one misconfigured gym is noise.
  const worst = new Map<string | null, AuditMatch[]>();
  for (const ms of bySlot.values()) {
    const venueId = ms[0].venueId ?? null;
    const limit = courts.get(venueId);
    if (limit == null || ms.length <= limit) continue;
    const current = worst.get(venueId);
    if (!current || ms.length > current.length) worst.set(venueId, ms);
  }

  return [...worst.entries()].map(([venueId, ms]) => ({
    kind: "venue_over_capacity" as const,
    venueId,
    summary: `${venueLabel(ms[0])} has ${courts.get(venueId)} court${courts.get(venueId) === 1 ? "" : "s"} but ${ms.length} games scheduled at once.`,
    matchIds: ms.map((m) => m.id),
  }));
}

/**
 * Every venue problem in a schedule, worst first.
 *
 * Ordered by how badly it breaks the night: a double-booked court or team stops
 * a game happening, capacity means somebody waits, and travel or a split
 * division is a judgement call the organizer may have made deliberately.
 */
export function findVenueConflicts(
  matches: AuditMatch[],
  capacity: VenueCapacityInput[] = [],
): VenueIssue[] {
  const severity: Record<VenueIssueKind, number> = {
    court_double_booked: 0,
    team_double_booked: 1,
    venue_over_capacity: 2,
    team_travels: 3,
    division_split: 4,
  };
  return [
    ...courtDoubleBookings(matches),
    ...teamDoubleBookings(matches),
    ...overCapacity(matches, capacity),
    ...travellingTeams(matches),
    ...splitDivisions(matches),
  ].sort(
    (a, b) =>
      severity[a.kind] - severity[b.kind] || a.summary.localeCompare(b.summary),
  );
}
