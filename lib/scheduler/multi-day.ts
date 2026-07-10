/**
 * Multi-day, multi-division pool layout (PRD §7, multi-day). Pure: no DB.
 *
 * Composes the existing single-division court layout (layoutPoolSchedule) across
 * divisions, honouring three organizer rules:
 *   1. Each division plays on its own courts, or shares a common pool of courts.
 *   2. Divisions that SHARE courts are kept blocked — one division's games run
 *      as a contiguous block, then the next division's, never interleaved.
 *   3. Pool games split across days by a per-team target (see day-split.ts).
 *
 * Divisions on distinct courts run in parallel; divisions sharing courts are
 * sequenced per day. The result carries an explicit day + real court number +
 * a per-day slot; the caller maps (day, slot) to a timestamp in that day's
 * window. With one division, one court set, and a single day this reduces to the
 * plain layoutPoolSchedule.
 */

import { layoutPoolSchedule, type LayoutPool } from "./pools";
import { assignMatchDays } from "./day-split";
import type { TeamId } from "./round-robin";

export interface DivisionLayoutInput {
  divisionId: string;
  pools: LayoutPool[];
  /** Specific court numbers this division uses; null/empty = the shared pool. */
  courts: number[] | null;
}

export interface MultiDayMatch {
  divisionId: string;
  /** Index into this division's `pools` array — maps back to the pool row. */
  poolIndex: number;
  /** 0-based playing day. */
  day: number;
  /** Actual court number (1-based). */
  court: number;
  /** 0-based time slot within the day, on that court. */
  slot: number;
  round: number;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  refTeamId: TeamId | null;
}

export function layoutMultiDaySchedule(
  divisions: DivisionLayoutInput[],
  totalCourts: number,
  perDayTargets: number[],
): MultiDayMatch[] {
  const courtCount = Math.max(1, totalCourts);
  const allCourts = Array.from({ length: courtCount }, (_, i) => i + 1);

  // Courts claimed by a specific division; the rest form the shared pool.
  const claimed = new Set<number>();
  for (const d of divisions) {
    for (const c of d.courts ?? []) {
      if (c >= 1 && c <= courtCount) claimed.add(c);
    }
  }
  const shared = allCourts.filter((c) => !claimed.has(c));
  const sharedPool = shared.length > 0 ? shared : allCourts;

  const courtsFor = (d: DivisionLayoutInput): number[] => {
    const own = (d.courts ?? []).filter((c) => c >= 1 && c <= courtCount);
    return own.length > 0 ? [...own].sort((a, b) => a - b) : sharedPool;
  };

  // Group divisions by identical court set — a shared set means they must be
  // sequenced (blocked); distinct sets run in parallel.
  const groups = new Map<string, DivisionLayoutInput[]>();
  const courtSetByKey = new Map<string, number[]>();
  for (const d of divisions) {
    const set = courtsFor(d);
    const key = set.join(",");
    courtSetByKey.set(key, set);
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }

  const out: MultiDayMatch[] = [];
  for (const [key, group] of groups) {
    const courtSet = courtSetByKey.get(key)!;
    // Next free slot per day on this group's shared courts — advanced after each
    // division so the next one's block starts where the previous ended.
    const dayOffset = new Map<number, number>();

    for (const div of group) {
      const local = layoutPoolSchedule(div.pools, courtSet.length);

      // Assign a day to each match in play order (slot, then court).
      const ordered = [...local].sort(
        (a, b) => a.slot - b.slot || a.court - b.court,
      );
      const days = assignMatchDays(
        ordered.map((m) => ({
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
        })),
        perDayTargets,
      );
      const dayOf = new Map<(typeof local)[number], number>();
      ordered.forEach((m, i) => dayOf.set(m, days[i]));

      // Group this division's matches by day, then re-slot each day per court
      // starting at the group's current offset for that day (keeps it blocked).
      const byDay = new Map<number, typeof local>();
      for (const m of local) {
        const d = dayOf.get(m)!;
        const list = byDay.get(d) ?? [];
        list.push(m);
        byDay.set(d, list);
      }

      for (const [day, dayMatches] of byDay) {
        const offset = dayOffset.get(day) ?? 0;
        const byCourt = new Map<number, typeof local>();
        for (const m of dayMatches) {
          const list = byCourt.get(m.court) ?? [];
          list.push(m);
          byCourt.set(m.court, list);
        }
        let blockLen = 0;
        for (const [localCourt, ms] of byCourt) {
          ms.sort((a, b) => a.slot - b.slot);
          ms.forEach((m, pos) => {
            out.push({
              divisionId: div.divisionId,
              poolIndex: m.poolIndex,
              day,
              court: courtSet[localCourt - 1],
              slot: offset + pos,
              round: m.round,
              homeTeamId: m.homeTeamId,
              awayTeamId: m.awayTeamId,
              refTeamId: m.refTeamId,
            });
            blockLen = Math.max(blockLen, pos + 1);
          });
        }
        dayOffset.set(day, offset + blockLen);
      }
    }
  }

  return out;
}
