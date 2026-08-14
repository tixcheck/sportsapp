import { describe, expect, it } from "vitest";

import {
  describeNight,
  maxLateStartSlots,
  orderTierNight,
  type SetPairing,
} from "@/lib/scheduler/ladder-night";

/** Every pairing `times` over. */
function doubleRR(teams: string[], times = 2): SetPairing[] {
  const out: SetPairing[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      for (let k = 0; k < times; k++) {
        out.push({ homeTeamId: teams[i], awayTeamId: teams[j] });
      }
    }
  }
  return out;
}

const key = (s: SetPairing) => [s.homeTeamId, s.awayTeamId].sort().join("|");

describe("keeping the night playable", () => {
  const teams = ["A", "B", "C", "D"];
  const sets = doubleRR(teams); // 12 sets, everyone 6

  it("plays every set exactly once", () => {
    const { order } = orderTierNight({ sets, teamIds: teams });
    expect(order).toHaveLength(12);
    const counts = new Map<string, number>();
    for (const s of order) counts.set(key(s), (counts.get(key(s)) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 2)).toBe(true);
  });

  it("gives every team its full share", () => {
    const { perTeam } = orderTierNight({ sets, teamIds: teams });
    expect(perTeam.every((t) => t.slots.length === 6)).toBe(true);
  });

  it("never makes a team play more than twice in a row", () => {
    const { perTeam } = orderTierNight({ sets, teamIds: teams });
    expect(
      Math.max(...perTeam.map((t) => t.maxConsecutive)),
    ).toBeLessThanOrEqual(2);
  });

  it("never repeats the same pairing back to back", () => {
    const { order } = orderTierNight({ sets, teamIds: teams });
    for (let i = 1; i < order.length; i++) {
      expect(key(order[i])).not.toBe(key(order[i - 1]));
    }
  });

  it("is deterministic for a given seed", () => {
    const a = orderTierNight({ sets, teamIds: teams, seed: 5 });
    const b = orderTierNight({ sets, teamIds: teams, seed: 5 });
    expect(a.order).toEqual(b.order);
  });

  it("gives a different night for a different week", () => {
    const wk1 = orderTierNight({ sets, teamIds: teams, seed: 1 });
    const wk3 = orderTierNight({ sets, teamIds: teams, seed: 3 });
    // Same games, but the running order shouldn't be identical every week.
    expect(wk1.order.map(key).join()).not.toBe(wk3.order.map(key).join());
  });

  it("handles an empty tier without throwing", () => {
    const r = orderTierNight({ sets: [], teamIds: [] });
    expect(r.order).toEqual([]);
  });
});

describe("the three-team tier", () => {
  const teams = ["A", "B", "C"];
  const sets = doubleRR(teams); // 6 sets, everyone 4

  it("rotates so everyone plays four and rests two", () => {
    const { perTeam } = orderTierNight({ sets, teamIds: teams });
    expect(perTeam.every((t) => t.slots.length === 4)).toBe(true);
    expect(
      Math.max(...perTeam.map((t) => t.maxConsecutive)),
    ).toBeLessThanOrEqual(2);
    expect(Math.max(...perTeam.map((t) => t.longestWait))).toBeLessThanOrEqual(
      1,
    );
  });
});

describe("the staggered start", () => {
  const teams = ["A", "B", "C", "TOP"];
  const sets = doubleRR(teams);

  it("keeps the late team out of the opening slots", () => {
    const { order, lateStartApplied } = orderTierNight({
      sets,
      teamIds: teams,
      lateTeamId: "TOP",
      lateStartSlots: 4,
    });
    expect(lateStartApplied).toBe(4);
    for (const s of order.slice(0, 4)) {
      expect(s.homeTeamId === "TOP" || s.awayTeamId === "TOP").toBe(false);
    }
  });

  it("still gives the late team its full share, with breaks", () => {
    const { perTeam } = orderTierNight({
      sets,
      teamIds: teams,
      lateTeamId: "TOP",
      lateStartSlots: 4,
    });
    const top = perTeam.find((t) => t.teamId === "TOP")!;
    expect(top.slots).toHaveLength(6);
    expect(top.slots[0]).toBeGreaterThanOrEqual(4);
    // The whole point: arriving late must not mean six straight sets.
    expect(top.maxConsecutive).toBeLessThanOrEqual(2);
  });

  it("caps the request at the number of sets that exclude the late team", () => {
    // Only 6 of the 12 sets don't involve TOP, so 8 is impossible.
    expect(maxLateStartSlots(sets, "TOP")).toBe(6);
    const r = orderTierNight({
      sets,
      teamIds: teams,
      lateTeamId: "TOP",
      lateStartSlots: 8,
    });
    expect(r.lateStartImpossible).toBe(true);
    expect(r.lateStartApplied).toBe(6);
  });

  it("does not flag impossible when the request fits", () => {
    const r = orderTierNight({
      sets,
      teamIds: teams,
      lateTeamId: "TOP",
      lateStartSlots: 6,
    });
    expect(r.lateStartImpossible).toBe(false);
  });

  it("ignores a late start when no team is named", () => {
    const r = orderTierNight({ sets, teamIds: teams, lateStartSlots: 4 });
    expect(r.lateStartApplied).toBe(0);
    expect(r.lateStartImpossible).toBe(false);
  });

  it("arriving at the last possible moment forces a straight run — the reason for 8:00", () => {
    // Held back for all 6 non-TOP sets, TOP must then play all 6 remaining
    // slots consecutively. This is the arrangement the organizer rejected.
    const { perTeam } = orderTierNight({
      sets,
      teamIds: teams,
      lateTeamId: "TOP",
      lateStartSlots: 6,
    });
    const top = perTeam.find((t) => t.teamId === "TOP")!;
    expect(top.maxConsecutive).toBe(6);
  });
});

describe("describeNight", () => {
  it("measures runs and waits from the slots a team plays", () => {
    const order: SetPairing[] = [
      { homeTeamId: "A", awayTeamId: "B" },
      { homeTeamId: "A", awayTeamId: "C" },
      { homeTeamId: "B", awayTeamId: "C" },
      { homeTeamId: "A", awayTeamId: "B" },
    ];
    const [a] = describeNight(order, ["A"]);
    expect(a.slots).toEqual([0, 1, 3]);
    expect(a.maxConsecutive).toBe(2);
    expect(a.longestWait).toBe(1);
  });
});
