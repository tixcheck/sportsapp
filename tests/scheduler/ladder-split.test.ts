import { describe, expect, it } from "vitest";

import {
  canSplitEvenly,
  splitTierNight,
  tierNightVolume,
} from "@/lib/scheduler/ladder-split";

const teams = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);

/** Every team's total, as a plain sorted array — the thing that must be even. */
function totals(n: number, target: number, week = 0): number[] {
  const res = splitTierNight({ teamIds: teams(n), target, week });
  return teams(n).map((id) => res.perTeam.get(id) ?? 0);
}

describe("splitTierNight", () => {
  it("splits the owner's example: 3 teams, 6 sets each", () => {
    const res = splitTierNight({ teamIds: teams(3), target: 6 });
    // 1v2, 2v3, 3v1 — three sets apiece.
    expect(res.meetings).toHaveLength(3);
    expect(res.meetings.every((m) => m.count === 3)).toBe(true);
    expect(totals(3, 6)).toEqual([6, 6, 6]);
    expect(res.total).toBe(9);
    expect(res.exact).toBe(true);
    expect(res.shortedTeamIds).toEqual([]);
  });

  it("splits 3 teams at 4 sets into two per pairing", () => {
    const res = splitTierNight({ teamIds: teams(3), target: 4 });
    expect(res.meetings.every((m) => m.count === 2)).toBe(true);
    expect(totals(3, 4)).toEqual([4, 4, 4]);
    expect(res.total).toBe(6);
  });

  it("handles a target that doesn't divide by the meeting count", () => {
    // 4 teams, 4 sets: 4 isn't divisible by 3, but one pairing at 2 and the
    // rest at 1 still lands every team on exactly 4.
    const res = splitTierNight({ teamIds: teams(4), target: 4 });
    expect(totals(4, 4)).toEqual([4, 4, 4, 4]);
    expect(res.exact).toBe(true);
    expect(res.total).toBe(8);
    expect(res.meetings.filter((m) => m.count === 2)).toHaveLength(2);
  });

  it("gives every pairing the same count when it divides evenly", () => {
    const res = splitTierNight({ teamIds: teams(4), target: 6 });
    expect(res.meetings).toHaveLength(6);
    expect(res.meetings.every((m) => m.count === 2)).toBe(true);
    expect(totals(4, 6)).toEqual([6, 6, 6, 6]);
  });

  it("shorts exactly one team when an equal split is impossible", () => {
    // 3 teams x 5 sets = 15 team-sets. Every set hands out 2, so 15 can't be
    // reached by all three — best is 5/5/4.
    const res = splitTierNight({ teamIds: teams(3), target: 5 });
    const got = totals(3, 5).sort((a, b) => b - a);
    expect(got).toEqual([5, 5, 4]);
    expect(res.exact).toBe(false);
    expect(res.shortedTeamIds).toHaveLength(1);
    // The shorted team is the one actually one short — not just any label.
    const short = res.shortedTeamIds[0];
    expect(res.perTeam.get(short)).toBe(4);
  });

  it("rotates who gets shorted from week to week", () => {
    const shorted = [0, 1, 2].map(
      (week) =>
        splitTierNight({ teamIds: teams(3), target: 5, week })
          .shortedTeamIds[0],
    );
    // Three different teams across three weeks — nobody is always short.
    expect(new Set(shorted).size).toBe(3);
  });

  it("keeps totals correct for a 5-team tier at 6 sets", () => {
    const res = splitTierNight({ teamIds: teams(5), target: 6 });
    expect(totals(5, 6)).toEqual([6, 6, 6, 6, 6]);
    expect(res.total).toBe(15);
    expect(res.exact).toBe(true);
  });

  it("handles a 2-team tier as a single pairing", () => {
    const res = splitTierNight({ teamIds: teams(2), target: 6 });
    expect(res.meetings).toEqual([
      { homeTeamId: "t1", awayTeamId: "t2", count: 6 },
    ]);
    expect(res.exact).toBe(true);
  });

  it("never schedules a pairing twice or a team against itself", () => {
    for (const n of [3, 4, 5, 6, 7, 8]) {
      for (const target of [1, 2, 3, 4, 5, 6, 7, 9, 12]) {
        const res = splitTierNight({ teamIds: teams(n), target });
        const keys = res.meetings.map((m) =>
          [m.homeTeamId, m.awayTeamId].sort().join("|"),
        );
        expect(new Set(keys).size).toBe(keys.length);
        expect(res.meetings.every((m) => m.homeTeamId !== m.awayTeamId)).toBe(
          true,
        );
      }
    }
  });

  it("is exact whenever n x target is even, across a wide sweep", () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9]) {
      for (let target = 1; target <= 12; target++) {
        const res = splitTierNight({ teamIds: teams(n), target });
        expect(res.exact).toBe(canSplitEvenly(n, target));
        // Even when inexact, nobody is more than one short.
        for (const v of res.perTeam.values()) {
          expect(target - v).toBeLessThanOrEqual(1);
          expect(v).toBeLessThanOrEqual(target);
        }
      }
    }
  });

  it("returns nothing for a tier too small to play, or a zero target", () => {
    expect(splitTierNight({ teamIds: teams(1), target: 6 }).meetings).toEqual(
      [],
    );
    expect(splitTierNight({ teamIds: [], target: 6 }).meetings).toEqual([]);
    expect(splitTierNight({ teamIds: teams(4), target: 0 }).meetings).toEqual(
      [],
    );
  });
});

describe("canSplitEvenly", () => {
  it("is false exactly when n x target is odd", () => {
    expect(canSplitEvenly(3, 5)).toBe(false);
    expect(canSplitEvenly(5, 3)).toBe(false);
    expect(canSplitEvenly(3, 6)).toBe(true);
    expect(canSplitEvenly(4, 5)).toBe(true);
  });
});

describe("tierNightVolume", () => {
  it("counts the sets a tier actually plays — the capacity number", () => {
    // 3 teams at 6 sets each is 9 sets on the night, not 18.
    expect(tierNightVolume(3, 6)).toBe(9);
    expect(tierNightVolume(5, 6)).toBe(15);
    // A tier drifting 5 -> 8 nearly doubles the court time it needs.
    expect(tierNightVolume(8, 6)).toBe(24);
    expect(tierNightVolume(1, 6)).toBe(0);
  });

  it("matches what the split actually produces", () => {
    for (const n of [2, 3, 4, 5, 6, 7]) {
      for (const target of [2, 4, 6]) {
        expect(splitTierNight({ teamIds: teams(n), target }).total).toBe(
          tierNightVolume(n, target),
        );
      }
    }
  });
});
