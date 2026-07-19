import { describe, expect, it } from "vitest";

import {
  pairKey,
  planMidSeasonSchedule,
  type MidSeasonInput,
} from "@/lib/scheduler/mid-season";

/** n team ids: t1..tn. */
function teams(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `t${i + 1}`);
}

/** Count how many games each team appears in. */
function gameCounts(matches: { homeTeamId: string; awayTeamId: string }[]) {
  const c = new Map<string, number>();
  for (const m of matches) {
    c.set(m.homeTeamId, (c.get(m.homeTeamId) ?? 0) + 1);
    c.set(m.awayTeamId, (c.get(m.awayTeamId) ?? 0) + 1);
  }
  return c;
}

/**
 * The concrete scenario the organizer hit: 12 pairs played week 1 (2 games
 * each), 2 new pairs join, target is 12 games, 5 weeks left at 2/week.
 */
function scenario(overrides: Partial<MidSeasonInput> = {}): MidSeasonInput {
  const existing = teams(12);
  const fresh = ["n1", "n2"];
  // Week 1: 2 rounds among the 12, all distinct pairings.
  const week1 = [
    ["t1", "t2"],
    ["t3", "t4"],
    ["t5", "t6"],
    ["t7", "t8"],
    ["t9", "t10"],
    ["t11", "t12"],
    ["t1", "t3"],
    ["t2", "t4"],
    ["t5", "t7"],
    ["t6", "t8"],
    ["t9", "t11"],
    ["t10", "t12"],
  ];
  const playedGamesByTeam: Record<string, number> = {};
  for (const t of existing) playedGamesByTeam[t] = 2;

  return {
    teamIds: [...existing, ...fresh],
    playedGamesByTeam,
    playedPairs: week1.map(([a, b]) => pairKey(a, b)),
    targetGames: 12,
    remainingWeekDates: [
      "2026-07-23",
      "2026-07-30",
      "2026-08-06",
      "2026-08-13",
      "2026-08-20",
    ],
    gamesPerWeek: 2,
    ...overrides,
  };
}

describe("planMidSeasonSchedule — mode A (new pairs play what fits)", () => {
  const plan = planMidSeasonSchedule(scenario());

  it("brings every returning team to exactly the 12-game target", () => {
    for (const t of teams(12)) {
      expect(plan.finalGamesByTeam[t]).toBe(12);
    }
  });

  it("gives the new pairs the 10 games the 5 remaining weeks allow", () => {
    expect(plan.finalGamesByTeam["n1"]).toBe(10);
    expect(plan.finalGamesByTeam["n2"]).toBe(10);
    // 5 weeks × 2/week is a hard ceiling — reported as a shortfall vs 12.
    expect(plan.shortfalls).toEqual(
      expect.arrayContaining([
        { teamId: "n1", got: 10, target: 12 },
        { teamId: "n2", got: 10, target: 12 },
      ]),
    );
  });

  it("never repeats a fixture that was already played", () => {
    const played = new Set(scenario().playedPairs);
    for (const m of plan.matches) {
      expect(played.has(pairKey(m.homeTeamId, m.awayTeamId))).toBe(false);
    }
  });

  it("never schedules the same new pairing twice (no forced rematch at 14 teams)", () => {
    const seen = new Set<string>();
    for (const m of plan.matches) {
      const key = pairKey(m.homeTeamId, m.awayTeamId);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("respects the 2-games-per-week grid (no doubleheaders in mode A)", () => {
    for (const m of plan.matches) {
      expect(m.wave).toBeLessThan(2);
      expect(m.makeup).toBe(false);
    }
  });

  it("lays games onto the remaining week dates only", () => {
    const allowed = new Set(scenario().remainingWeekDates);
    for (const m of plan.matches) expect(allowed.has(m.weekDate)).toBe(true);
  });

  it("does not push any returning team past the target", () => {
    const counts = gameCounts(plan.matches);
    for (const t of teams(12)) {
      // 2 already played + at most 10 new = 12.
      expect((counts.get(t) ?? 0) + 2).toBeLessThanOrEqual(12);
    }
  });

  it("is deterministic for a given seed", () => {
    const a = planMidSeasonSchedule(scenario({ seed: 7 }));
    const b = planMidSeasonSchedule(scenario({ seed: 7 }));
    expect(a.matches).toEqual(b.matches);
  });

  it("is complete — every intended game placed", () => {
    expect(plan.incomplete).toBe(false);
  });
});

describe("planMidSeasonSchedule — mode B (new pairs catch up via make-ups)", () => {
  const plan = planMidSeasonSchedule(scenario({ makeupTeamIds: ["n1", "n2"] }));

  it("gets the new pairs all the way to 12", () => {
    expect(plan.finalGamesByTeam["n1"]).toBe(12);
    expect(plan.finalGamesByTeam["n2"]).toBe(12);
    expect(plan.shortfalls).toHaveLength(0);
  });

  it("still keeps every returning team at exactly 12", () => {
    for (const t of teams(12)) expect(plan.finalGamesByTeam[t]).toBe(12);
  });

  it("adds the catch-up games as make-ups between the new pairs only", () => {
    const makeups = plan.matches.filter((m) => m.makeup);
    expect(makeups).toHaveLength(2);
    for (const m of makeups) {
      expect(new Set([m.homeTeamId, m.awayTeamId])).toEqual(
        new Set(["n1", "n2"]),
      );
      expect(m.wave).toBeGreaterThanOrEqual(2); // an extra wave beyond the grid
    }
  });

  it("places make-ups in different weeks", () => {
    const weeks = plan.matches.filter((m) => m.makeup).map((m) => m.weekDate);
    expect(new Set(weeks).size).toBe(weeks.length);
  });
});

describe("planMidSeasonSchedule — general behavior", () => {
  it("handles an odd total team count with a bye each round", () => {
    const plan = planMidSeasonSchedule({
      teamIds: teams(5),
      targetGames: 4,
      remainingWeekDates: [
        "2026-07-23",
        "2026-07-30",
        "2026-08-06",
        "2026-08-13",
      ],
      gamesPerWeek: 1,
    });
    // 5 teams, 1 game/week: at most 2 games/round, one team byes each round.
    for (const m of plan.matches) {
      expect(m.homeTeamId).not.toBe(m.awayTeamId);
    }
    expect(plan.matches.length).toBeGreaterThan(0);
  });

  it("returns nothing to schedule when everyone is already at target", () => {
    const played: Record<string, number> = {};
    for (const t of teams(4)) played[t] = 6;
    const plan = planMidSeasonSchedule({
      teamIds: teams(4),
      playedGamesByTeam: played,
      targetGames: 6,
      remainingWeekDates: ["2026-07-23"],
      gamesPerWeek: 2,
    });
    expect(plan.matches).toHaveLength(0);
    expect(plan.shortfalls).toHaveLength(0);
  });

  it("caps games at what the remaining weeks hold, not the target", () => {
    // Only 1 week left, but 4 games wanted — everyone comes up short.
    const plan = planMidSeasonSchedule({
      teamIds: teams(4),
      targetGames: 4,
      remainingWeekDates: ["2026-07-23"],
      gamesPerWeek: 1,
    });
    const counts = gameCounts(plan.matches);
    for (const t of teams(4)) expect(counts.get(t) ?? 0).toBeLessThanOrEqual(1);
  });

  it("byes the unpairable team but still schedules the rest of the round", () => {
    // 5 teams; 'a' has already played everyone, so it can't get a legal game
    // this round — but b/c/d/e must still be paired into 2 games, not stranded.
    const plan = planMidSeasonSchedule({
      teamIds: ["a", "b", "c", "d", "e"],
      playedGamesByTeam: { a: 4, b: 1, c: 1, d: 1, e: 1 },
      playedPairs: [
        pairKey("a", "b"),
        pairKey("a", "c"),
        pairKey("a", "d"),
        pairKey("a", "e"),
      ],
      targetGames: 4,
      remainingWeekDates: ["2026-07-23"],
      gamesPerWeek: 1,
    });
    // One round, 5 teams: 'a' byes, the other four play 2 games.
    const round0 = plan.matches.filter((m) => m.slot === 0);
    expect(round0).toHaveLength(2);
    expect(
      round0.some((m) => m.homeTeamId === "a" || m.awayTeamId === "a"),
    ).toBe(false);
  });

  it("flags incomplete when a game can't be placed without a repeat", () => {
    // Two teams, target 1 more game each, but they've already played each other
    // and there's no one else — no legal game exists.
    const plan = planMidSeasonSchedule({
      teamIds: ["a", "b"],
      playedGamesByTeam: { a: 1, b: 1 },
      playedPairs: [pairKey("a", "b")],
      targetGames: 2,
      remainingWeekDates: ["2026-07-23"],
      gamesPerWeek: 1,
    });
    expect(plan.matches).toHaveLength(0);
    expect(plan.incomplete).toBe(true);
    expect(plan.shortfalls).toEqual([
      { teamId: "a", got: 1, target: 2 },
      { teamId: "b", got: 1, target: 2 },
    ]);
  });

  it("avoids a large played-pair set without repeating any", () => {
    // 6 teams, everyone already played teams 'to their right' once.
    const ids = teams(6);
    const playedPairs = [
      pairKey("t1", "t2"),
      pairKey("t3", "t4"),
      pairKey("t5", "t6"),
    ];
    const plan = planMidSeasonSchedule({
      teamIds: ids,
      playedGamesByTeam: { t1: 1, t2: 1, t3: 1, t4: 1, t5: 1, t6: 1 },
      playedPairs,
      targetGames: 5,
      remainingWeekDates: ["a", "b", "c", "d"],
      gamesPerWeek: 1,
    });
    const forbidden = new Set(playedPairs);
    const seen = new Set<string>();
    for (const m of plan.matches) {
      const k = pairKey(m.homeTeamId, m.awayTeamId);
      expect(forbidden.has(k)).toBe(false);
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });
});
