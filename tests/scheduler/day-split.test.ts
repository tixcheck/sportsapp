import { describe, expect, it } from "vitest";

import { assignMatchDays, type DaySplitMatch } from "@/lib/scheduler/day-split";
import { generatePairings } from "@/lib/scheduler/round-robin";

/** Single round-robin over n teams, flattened to play (round) order. */
function rrMatches(n: number): DaySplitMatch[] {
  const teams = Array.from({ length: n }, (_, i) => `T${i + 1}`);
  return generatePairings(teams, 1).flatMap((r) =>
    r.pairs.map((p) => ({
      homeTeamId: p.homeTeamId,
      awayTeamId: p.awayTeamId,
    })),
  );
}

/** team id → games played on each day index. */
function perTeamByDay(
  matches: DaySplitMatch[],
  days: number[],
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  matches.forEach((m, i) => {
    for (const id of [m.homeTeamId, m.awayTeamId]) {
      const arr = out.get(id) ?? [];
      arr[days[i]] = (arr[days[i]] ?? 0) + 1;
      out.set(id, arr);
    }
  });
  return out;
}

describe("assignMatchDays", () => {
  it("puts everything on day 0 for a single-day target", () => {
    const days = assignMatchDays(rrMatches(12), [11]);
    expect(days.every((d) => d === 0)).toBe(true);
  });

  it("puts everything on day 0 for no / empty targets", () => {
    expect(assignMatchDays(rrMatches(6), []).every((d) => d === 0)).toBe(true);
  });

  it("never exceeds a team's day-0 cap and preserves every team's total (7/4)", () => {
    const matches = rrMatches(12); // each team plays 11
    const days = assignMatchDays(matches, [7, 4]);
    expect(days.every((d) => d === 0 || d === 1)).toBe(true);
    for (const [, byDay] of perTeamByDay(matches, days)) {
      expect(byDay[0] ?? 0).toBeLessThanOrEqual(7); // day-0 cap, may flex down
      expect((byDay[0] ?? 0) + (byDay[1] ?? 0)).toBe(11); // nothing dropped
    }
  });

  it("respects cumulative caps across three days (4/4/3)", () => {
    const matches = rrMatches(12);
    const days = assignMatchDays(matches, [4, 4, 3]);
    expect(days.every((d) => d >= 0 && d <= 2)).toBe(true);
    for (const [, byDay] of perTeamByDay(matches, days)) {
      const d0 = byDay[0] ?? 0;
      const d1 = byDay[1] ?? 0;
      const d2 = byDay[2] ?? 0;
      expect(d0).toBeLessThanOrEqual(4); // day 0 cumulative cap
      expect(d0 + d1).toBeLessThanOrEqual(8); // day 1 cumulative cap
      expect(d0 + d1 + d2).toBe(11); // total preserved
    }
  });

  it("keeps a short pool entirely on day 0 when it can't fill the target", () => {
    const matches = rrMatches(4); // each team plays 3, target day 0 is 7
    expect(assignMatchDays(matches, [7, 4]).every((d) => d === 0)).toBe(true);
  });

  it("rolls the remainder onto the last day when targets undershoot", () => {
    const matches = rrMatches(8); // each team plays 7
    const days = assignMatchDays(matches, [2, 2]); // sum 4 < 7
    for (const [, byDay] of perTeamByDay(matches, days)) {
      expect(byDay[0] ?? 0).toBeLessThanOrEqual(2); // early day capped
      expect((byDay[0] ?? 0) + (byDay[1] ?? 0)).toBe(7); // last day absorbs rest
    }
  });

  it("assigns a shared match to the later day when one team's earlier day is full", () => {
    // A-B, A-C, B-C — each team plays 2. Target 1 game/day.
    const matches: DaySplitMatch[] = [
      { homeTeamId: "A", awayTeamId: "B" },
      { homeTeamId: "A", awayTeamId: "C" },
      { homeTeamId: "B", awayTeamId: "C" },
    ];
    // A-B fills A and B on day 0; A-C then needs day 1 (A full); B-C too.
    expect(assignMatchDays(matches, [1, 1])).toEqual([0, 1, 1]);
  });

  it("ignores zero-game days in the target list", () => {
    const matches = rrMatches(6);
    expect(assignMatchDays(matches, [3, 0, 2])).toEqual(
      assignMatchDays(matches, [3, 2]),
    );
  });
});
