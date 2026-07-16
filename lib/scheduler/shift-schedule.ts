/**
 * Bulk schedule shift ("postpone a week"). Pure: no DB access.
 *
 * An organizer cancels a slate — bad air quality, a closed venue — and pushes
 * the rest of the season back by N weeks. Every not-yet-played match on or after
 * the cutoff date moves; anything already played stays exactly where it is, so
 * results and standings are untouched.
 *
 * Shifting is done in the venue timezone with luxon's calendar arithmetic, not
 * by adding milliseconds: a 7pm game must stay a 7pm game even when the jump
 * crosses a DST boundary.
 */

import { DateTime } from "luxon";

import { detectConflicts, type SlotMatch } from "./conflicts";

export interface ShiftMatch {
  id: string;
  scheduledAt: string | null;
  court: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  status: string;
}

export interface ShiftMove {
  matchId: string;
  from: string;
  to: string;
}

export type SkipReason = "no-time" | "already-played" | "before-cutoff";

export interface ShiftSkip {
  matchId: string;
  reason: SkipReason;
}

export interface ShiftWarning {
  type: "blackout" | "court" | "team";
  matchId: string;
  detail: string;
}

export interface ShiftPlan {
  moves: ShiftMove[];
  skipped: ShiftSkip[];
  warnings: ShiftWarning[];
  /** Local dates left with no games by the shift — the "No Games" week(s). */
  vacatedDates: string[];
  /** `endDate` pushed by the same number of weeks, or null if none was given. */
  newEndDate: string | null;
}

/** A match at or past these statuses has been settled and must never move. */
const SETTLED = new Set(["in_progress", "completed", "forfeit"]);

export interface PlanScheduleShiftOptions {
  matches: ShiftMatch[];
  /** Local calendar date (yyyy-mm-dd); matches on/after this move. */
  fromDate: string;
  weeks: number;
  timezone: string;
  blackoutDates?: string[];
  endDate?: string | null;
}

export function planScheduleShift(opts: PlanScheduleShiftOptions): ShiftPlan {
  const { matches, fromDate, weeks, timezone, endDate = null } = opts;
  const blackout = new Set(opts.blackoutDates ?? []);

  const moves: ShiftMove[] = [];
  const skipped: ShiftSkip[] = [];
  const warnings: ShiftWarning[] = [];

  if (!Number.isInteger(weeks) || weeks < 1) {
    return { moves, skipped, warnings, vacatedDates: [], newEndDate: null };
  }

  const cutoff = DateTime.fromISO(fromDate, { zone: timezone }).startOf("day");
  if (!cutoff.isValid) {
    return { moves, skipped, warnings, vacatedDates: [], newEndDate: null };
  }

  const movedIds = new Set<string>();

  for (const m of matches) {
    if (!m.scheduledAt) {
      skipped.push({ matchId: m.id, reason: "no-time" });
      continue;
    }
    if (SETTLED.has(m.status)) {
      skipped.push({ matchId: m.id, reason: "already-played" });
      continue;
    }

    const at = DateTime.fromISO(m.scheduledAt, { zone: timezone });
    if (!at.isValid) {
      skipped.push({ matchId: m.id, reason: "no-time" });
      continue;
    }
    if (at.startOf("day") < cutoff) {
      skipped.push({ matchId: m.id, reason: "before-cutoff" });
      continue;
    }

    // Calendar-aware: keeps the local wall-clock time across DST changes.
    const to = at.plus({ weeks });
    moves.push({ matchId: m.id, from: m.scheduledAt, to: to.toUTC().toISO()! });
    movedIds.add(m.id);

    const landsOn = to.toISODate()!;
    if (blackout.has(landsOn)) {
      warnings.push({
        type: "blackout",
        matchId: m.id,
        detail: `Lands on ${landsOn}, a blackout date.`,
      });
    }
  }

  // Matches that stay put are the only source of *new* collisions: everything
  // that moves shifts by the same amount, so their relative layout is preserved.
  const staying: SlotMatch[] = matches
    .filter((m) => !movedIds.has(m.id))
    .map((m) => ({
      id: m.id,
      scheduledAt: m.scheduledAt,
      court: m.court,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
    }));

  const byId = new Map(matches.map((m) => [m.id, m]));
  for (const mv of moves) {
    const m = byId.get(mv.matchId)!;
    for (const c of detectConflicts(
      { id: m.id, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId },
      mv.to,
      m.court,
      staying,
    )) {
      warnings.push({
        type: c.type,
        matchId: m.id,
        detail:
          c.type === "court"
            ? `Court clashes with a game that isn't moving.`
            : `A team already plays a game that isn't moving at this time.`,
      });
    }
  }

  return {
    moves,
    skipped,
    warnings,
    vacatedDates: computeVacatedDates(matches, moves, movedIds, timezone),
    newEndDate: shiftEndDate(endDate, weeks, timezone),
  };
}

/**
 * Dates that had games before the shift and have none after — these become the
 * "No Games" days an organizer can persist as blackout dates.
 */
function computeVacatedDates(
  matches: ShiftMatch[],
  moves: ShiftMove[],
  movedIds: Set<string>,
  timezone: string,
): string[] {
  const localDate = (iso: string) =>
    DateTime.fromISO(iso, { zone: timezone }).toISODate();

  const before = new Set<string>();
  for (const mv of moves) {
    const d = localDate(mv.from);
    if (d) before.add(d);
  }

  const after = new Set<string>();
  for (const mv of moves) {
    const d = localDate(mv.to);
    if (d) after.add(d);
  }
  for (const m of matches) {
    if (movedIds.has(m.id) || !m.scheduledAt) continue;
    const d = localDate(m.scheduledAt);
    if (d) after.add(d);
  }

  return [...before].filter((d) => !after.has(d)).sort();
}

function shiftEndDate(
  endDate: string | null,
  weeks: number,
  timezone: string,
): string | null {
  if (!endDate) return null;
  const d = DateTime.fromISO(endDate, { zone: timezone });
  return d.isValid ? d.plus({ weeks }).toISODate() : null;
}
