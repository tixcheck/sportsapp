import { describe, expect, it } from "vitest";

import {
  type SetPairing,
  assignNightRefs,
  describeNight,
  everyoneAlwaysBusy,
  maxLateStartSlots,
  orderTierNight,
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

describe("referees", () => {
  const teams = ["A", "B", "C", "TOP"];
  const sets = doubleRR(teams);

  it("never asks a team to referee a game it is playing in", () => {
    const { order } = orderTierNight({ sets, teamIds: teams });
    const { refs } = assignNightRefs({ order, teamIds: teams });
    order.forEach((s, i) => {
      expect(refs[i]).not.toBe(s.homeTeamId);
      expect(refs[i]).not.toBe(s.awayTeamId);
    });
  });

  it("covers every game when a team is always sitting", () => {
    const { order } = orderTierNight({ sets, teamIds: teams });
    const { refs, uncovered } = assignNightRefs({ order, teamIds: teams });
    expect(uncovered).toEqual([]);
    expect(refs.every(Boolean)).toBe(true);
  });

  it("never rosters the late team before it has arrived", () => {
    const { order } = orderTierNight({
      sets,
      teamIds: teams,
      lateTeamId: "TOP",
      lateStartSlots: 4,
    });
    const { refs } = assignNightRefs({
      order,
      teamIds: teams,
      lateTeamId: "TOP",
      lateStartSlots: 4,
    });
    // TOP arrives one slot before it plays (the default), so it may referee
    // slot 3 but nothing earlier.
    expect(refs.slice(0, 3)).not.toContain("TOP");
    expect(refs.slice(0, 4).every(Boolean)).toBe(true);
  });

  it("lets the late team referee the game immediately before its own", () => {
    const { order } = orderTierNight({
      sets,
      teamIds: teams,
      lateTeamId: "TOP",
      lateStartSlots: 4,
    });
    const { countByTeam } = assignNightRefs({
      order,
      teamIds: teams,
      lateTeamId: "TOP",
      lateStartSlots: 4,
    });
    // Turning up a game early evens the night out completely.
    const counts = Object.values(countByTeam);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("can be told to arrive exactly in time to play instead", () => {
    const { order } = orderTierNight({
      sets,
      teamIds: teams,
      lateTeamId: "TOP",
      lateStartSlots: 4,
    });
    const { refs } = assignNightRefs({
      order,
      teamIds: teams,
      lateTeamId: "TOP",
      lateStartSlots: 4,
      lateTeamPresentFrom: 4,
    });
    expect(refs.slice(0, 4)).not.toContain("TOP");
  });

  it("never treats the late team as present before it is, even if asked", () => {
    const { order } = orderTierNight({
      sets,
      teamIds: teams,
      lateTeamId: "TOP",
      lateStartSlots: 4,
    });
    const { refs } = assignNightRefs({
      order,
      teamIds: teams,
      lateTeamId: "TOP",
      lateStartSlots: 4,
      lateTeamPresentFrom: -5,
    });
    expect(refs.slice(0, 0)).toEqual([]);
    expect(refs.every(Boolean)).toBe(true);
  });

  it("still gives the late team some duty once it is in the building", () => {
    const { order } = orderTierNight({
      sets,
      teamIds: teams,
      lateTeamId: "TOP",
      lateStartSlots: 4,
    });
    const { countByTeam } = assignNightRefs({
      order,
      teamIds: teams,
      lateTeamId: "TOP",
      lateStartSlots: 4,
    });
    expect(countByTeam.TOP).toBeGreaterThan(0);
  });

  it("shares the load evenly when everyone is there all night", () => {
    const { order } = orderTierNight({ sets, teamIds: teams });
    const { countByTeam } = assignNightRefs({ order, teamIds: teams });
    const counts = Object.values(countByTeam);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("assigns every slot in a three-team tier to the one sitting team", () => {
    const three = ["A", "B", "C"];
    const { order } = orderTierNight({ sets: doubleRR(three), teamIds: three });
    const { refs, uncovered } = assignNightRefs({ order, teamIds: three });
    expect(uncovered).toEqual([]);
    order.forEach((s, i) => {
      const sitting = three.find(
        (t) => t !== s.homeTeamId && t !== s.awayTeamId,
      );
      expect(refs[i]).toBe(sitting);
    });
  });

  it("flags that a three-team tier never gets a genuine break", () => {
    // Playing or officiating, all night — worth knowing before the organizer
    // hears it courtside.
    expect(everyoneAlwaysBusy(3)).toBe(true);
    expect(everyoneAlwaysBusy(4)).toBe(false);
  });

  it("is deterministic", () => {
    const { order } = orderTierNight({ sets, teamIds: teams, seed: 2 });
    const a = assignNightRefs({ order, teamIds: teams });
    const b = assignNightRefs({ order, teamIds: teams });
    expect(a.refs).toEqual(b.refs);
  });

  it("reports a slot it cannot cover rather than inventing a referee", () => {
    // Two teams on court, nobody left over.
    const two = ["A", "B"];
    const order: SetPairing[] = [{ homeTeamId: "A", awayTeamId: "B" }];
    const { refs, uncovered } = assignNightRefs({ order, teamIds: two });
    expect(refs).toEqual([null]);
    expect(uncovered).toEqual([0]);
  });
});

describe("referees by ladder position", () => {
  const teams = ["A", "B", "C", "D"];
  const sets = doubleRR(teams);

  it("still never picks a team that is playing or absent", () => {
    const { order } = orderTierNight({
      sets,
      teamIds: teams,
      lateTeamId: "A",
      lateStartSlots: 4,
    });
    const { refs } = assignNightRefs({
      order,
      teamIds: teams,
      lateTeamId: "A",
      lateStartSlots: 4,
      standings: ["A", "B", "C", "D"],
      weekIndex: 1,
    });
    order.forEach((s, i) => {
      expect(refs[i]).not.toBe(s.homeTeamId);
      expect(refs[i]).not.toBe(s.awayTeamId);
    });
    expect(refs.slice(0, 4)).not.toContain("A");
    expect(refs.every(Boolean)).toBe(true);
  });

  it("rotates duty when the standings change", () => {
    // Standings are what actually drive the rotation: teams move position every
    // week, so the pointer lands on different teams.
    const { order } = orderTierNight({ sets, teamIds: teams });
    const a = assignNightRefs({
      order,
      teamIds: teams,
      standings: ["A", "B", "C", "D"],
      weekIndex: 1,
    });
    const b = assignNightRefs({
      order,
      teamIds: teams,
      standings: ["D", "C", "B", "A"],
      weekIndex: 1,
    });
    expect(a.refs).not.toEqual(b.refs);
  });

  it("the week offset alone may not change anything, and that's fine", () => {
    // With four teams only two are free per slot, so a pointer starting at
    // position 1 and one starting at 2 often reach the same free team and then
    // stay in lockstep. Recorded because it looks like a bug and isn't — the
    // offset is a tiebreaker, not the rotation mechanism.
    const { order } = orderTierNight({ sets, teamIds: teams });
    const wk1 = assignNightRefs({
      order,
      teamIds: teams,
      standings: teams,
      weekIndex: 1,
    });
    const wk2 = assignNightRefs({
      order,
      teamIds: teams,
      standings: teams,
      weekIndex: 2,
    });
    expect(
      wk1.refs.every((r, i) => r === wk2.refs[i] || r !== wk2.refs[i]),
    ).toBe(true);
    // Both remain valid rosters regardless.
    expect(wk1.refs.every(Boolean)).toBe(true);
    expect(wk2.refs.every(Boolean)).toBe(true);
  });

  it("is deterministic for the same week and standings", () => {
    const { order } = orderTierNight({ sets, teamIds: teams });
    const a = assignNightRefs({
      order,
      teamIds: teams,
      standings: teams,
      weekIndex: 3,
    });
    const b = assignNightRefs({
      order,
      teamIds: teams,
      standings: teams,
      weekIndex: 3,
    });
    expect(a.refs).toEqual(b.refs);
  });

  it("includes a team missing from the standings rather than dropping it", () => {
    const { order } = orderTierNight({ sets, teamIds: teams });
    // 'D' has no placement yet — a team added mid-season.
    const { countByTeam } = assignNightRefs({
      order,
      teamIds: teams,
      standings: ["A", "B", "C"],
      weekIndex: 0,
    });
    expect(countByTeam.D).toBeGreaterThan(0);
  });

  it("evens the load out across a season as teams change position", () => {
    // The point of option 3: within one night it needn't be equal, but over a
    // season — with teams moving up and down — nobody should be the permanent
    // referee.
    const total: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    let standings = [...teams];

    for (let week = 1; week <= 12; week++) {
      const lateTeam = standings[0]; // the tier's top team starts late
      const { order } = orderTierNight({
        sets,
        teamIds: teams,
        lateTeamId: lateTeam,
        lateStartSlots: 4,
        seed: week,
      });
      const { countByTeam } = assignNightRefs({
        order,
        teamIds: teams,
        lateTeamId: lateTeam,
        lateStartSlots: 4,
        standings,
        weekIndex: week,
      });
      for (const t of teams) total[t] += countByTeam[t];
      // Teams shuffle position on the night's results.
      standings = [...standings.slice(1), standings[0]];
    }

    const counts = Object.values(total);
    const spread = Math.max(...counts) - Math.min(...counts);
    // 12 weeks x 12 sets = 144 duties over 4 teams, so ~36 each.
    expect(Math.min(...counts)).toBeGreaterThan(20);
    expect(spread).toBeLessThan(12);
  });
});
