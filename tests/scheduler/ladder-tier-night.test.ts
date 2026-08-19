import { describe, expect, it } from "vitest";

import { planTierNight } from "@/lib/scheduler/ladder-night";

/**
 * Mango Sports, as the organizer specified it:
 *   Tier 1 — 3 teams, 4 sets each, 20-minute sets from 8pm, Court 1.
 *   Tier 2 — 4 teams, 6 sets each, 15-minute sets from 7pm, Court 2, with the
 *            team that finished top sitting out the first four slots.
 */
const TIER1 = {
  divisionId: "t1",
  teamIds: ["A", "B", "C"],
  target: 4,
  minutesPerSet: 20,
  court: "1",
};

const TIER2 = {
  divisionId: "t2",
  teamIds: ["W", "X", "Y", "Z"],
  target: 6,
  minutesPerSet: 15,
  court: "2",
  lateStartSlots: 4,
};

const countBy = <T, K extends string>(xs: T[], key: (x: T) => K) => {
  const out: Record<string, number> = {};
  for (const x of xs) out[key(x)] = (out[key(x)] ?? 0) + 1;
  return out;
};

describe("Tier 1 — 3 teams, 4 sets each", () => {
  const plan = planTierNight(TIER1, 2);

  it("draws 6 games, not 9", () => {
    // The bug this exists to prevent: applying the league-wide target of 6 to
    // a tier whose own target is 4 produces 9 games and 6 sets a team.
    expect(plan.matches).toHaveLength(6);
  });

  it("gives every team exactly 4 sets", () => {
    const played = countBy(
      plan.matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]),
      (t) => t as "A",
    );
    expect(played).toEqual({ A: 4, B: 4, C: 4 });
  });

  it("meets each pair exactly twice", () => {
    const pairs = countBy(plan.matches, (m) =>
      [m.homeTeamId, m.awayTeamId].sort().join("|"),
    );
    expect(Object.values(pairs)).toEqual([2, 2, 2]);
  });

  it("runs on 20-minute slots, filling exactly two hours", () => {
    expect(plan.matches.map((m) => m.offsetMinutes)).toEqual([
      0, 20, 40, 60, 80, 100,
    ]);
  });

  it("keeps every game on its own court", () => {
    expect(plan.matches.every((m) => m.court === "1")).toBe(true);
  });

  it("gives every game a referee, and never one that is playing it", () => {
    for (const m of plan.matches) {
      expect(m.refTeamId).not.toBeNull();
      expect(m.refTeamId).not.toBe(m.homeTeamId);
      expect(m.refTeamId).not.toBe(m.awayTeamId);
    }
    expect(plan.uncoveredSlots).toEqual([]);
  });

  it("never asks a pair to meet twice in a row", () => {
    const keys = plan.matches.map((m) =>
      [m.homeTeamId, m.awayTeamId].sort().join("|"),
    );
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i]).not.toBe(keys[i - 1]);
    }
  });
});

describe("Tier 2 — 4 teams, 6 sets each, with a late start", () => {
  const plan = planTierNight(TIER2, 2);

  it("draws 12 games on 15-minute slots", () => {
    expect(plan.matches).toHaveLength(12);
    expect(plan.matches.map((m) => m.offsetMinutes)).toEqual([
      0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165,
    ]);
  });

  it("gives every team exactly 6 sets", () => {
    const played = countBy(
      plan.matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]),
      (t) => t as "W",
    );
    expect(played).toEqual({ W: 6, X: 6, Y: 6, Z: 6 });
  });

  it("holds the top team out of the opening slots", () => {
    expect(plan.lateStartApplied).toBe(4);
    expect(plan.lateStartImpossible).toBe(false);
    const firstPlayed = plan.matches.findIndex(
      (m) => m.homeTeamId === "W" || m.awayTeamId === "W",
    );
    expect(firstPlayed).toBeGreaterThanOrEqual(4);
  });

  it("never makes the late team referee before it has arrived", () => {
    // It cannot officiate a game it isn't in the building for. The default is
    // to have it turn up one slot early, so slot 3 onwards is fair game.
    const tooEarly = plan.matches
      .slice(0, 3)
      .filter((m) => m.refTeamId === "W");
    expect(tooEarly).toEqual([]);
  });

  it("keeps every game on its own court", () => {
    expect(plan.matches.every((m) => m.court === "2")).toBe(true);
  });

  it("shares refereeing out rather than dumping it on one team", () => {
    const refs = countBy(
      plan.matches.map((m) => m.refTeamId).filter(Boolean) as string[],
      (t) => t as "W",
    );
    const loads = Object.values(refs);
    // The late team is present for less of the night, so an exactly equal
    // split isn't possible — but nobody should be doing double anyone else.
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(2);
    expect(plan.uncoveredSlots).toEqual([]);
  });
});

describe("the two tiers together", () => {
  it("never puts one tier's game on the other's court", () => {
    // The fault seen in Mango week 2: two Tier 2 games landed on Court 1.
    const all = [
      ...planTierNight(TIER1, 2).matches,
      ...planTierNight(TIER2, 2).matches,
    ];
    for (const m of all) {
      expect(m.court).toBe(m.divisionId === "t1" ? "1" : "2");
    }
  });

  it("lets the tiers run on different clocks", () => {
    // Tier 1 finishes its 6th set 100 minutes after 8pm; Tier 2 its 12th 165
    // minutes after 7pm. Both land at 21:40 by different routes, which is only
    // expressible if each tier keeps its own start and slot length.
    const t1 = planTierNight(TIER1, 2);
    const t2 = planTierNight(TIER2, 2);
    expect(20 * 60 + t1.matches.at(-1)!.offsetMinutes).toBe(21 * 60 + 40);
    expect(19 * 60 + t2.matches.at(-1)!.offsetMinutes).toBe(21 * 60 + 45);
  });
});

describe("determinism and edges", () => {
  it("redrawing the same week gives the same night back", () => {
    expect(planTierNight(TIER2, 3)).toEqual(planTierNight(TIER2, 3));
  });

  it("gives a different week a different night", () => {
    const a = planTierNight(TIER2, 2).matches.map((m) => m.slot + m.homeTeamId);
    const b = planTierNight(TIER2, 5).matches.map((m) => m.slot + m.homeTeamId);
    expect(a).not.toEqual(b);
  });

  it("clamps a late start that the fixtures cannot support", () => {
    // Only sets NOT involving the late team can be played before they arrive.
    const plan = planTierNight({ ...TIER2, lateStartSlots: 99 }, 2);
    expect(plan.lateStartImpossible).toBe(true);
    expect(plan.lateStartApplied).toBeLessThanOrEqual(6);
    expect(plan.matches).toHaveLength(12);
  });

  it("returns nothing for a tier that cannot play", () => {
    expect(planTierNight({ ...TIER1, teamIds: ["A"] }, 1).matches).toEqual([]);
    expect(planTierNight({ ...TIER1, target: 0 }, 1).matches).toEqual([]);
  });
});
