import { describe, expect, it } from "vitest";

import {
  planTieredLeagueSchedule,
  type LeagueTier,
} from "@/lib/scheduler/tiered-league";

const BASE = {
  startDate: "2026-09-01",
  intervalDays: 7,
  gamesPerWeek: 1,
  courts: 4,
};

function teams(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
}

/** Unordered pair key. */
function pk(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

describe("planTieredLeagueSchedule", () => {
  it("a single tier behaves like a normal round robin (everyone plays everyone)", () => {
    const tier: LeagueTier = { divisionId: "d1", teamIds: teams("A", 4) };
    const { matches } = planTieredLeagueSchedule([tier], BASE);
    const pairs = new Set(matches.map((m) => pk(m.homeTeamId, m.awayTeamId)));
    // 4 teams → C(4,2) = 6 distinct pairings.
    expect(pairs.size).toBe(6);
    expect(matches).toHaveLength(6);
    expect(matches.every((m) => m.divisionId === "d1")).toBe(true);
  });

  it("teams only ever play within their own tier — never across tiers", () => {
    const tiers: LeagueTier[] = [
      { divisionId: "rec", teamIds: teams("R", 4) },
      { divisionId: "comp", teamIds: teams("C", 4) },
    ];
    const { matches } = planTieredLeagueSchedule(tiers, BASE);
    for (const m of matches) {
      const sameTier =
        (m.homeTeamId[0] === "R" && m.awayTeamId[0] === "R") ||
        (m.homeTeamId[0] === "C" && m.awayTeamId[0] === "C");
      expect(sameTier).toBe(true);
      // divisionId matches the teams' tier.
      expect(m.divisionId).toBe(m.homeTeamId[0] === "R" ? "rec" : "comp");
    }
    // Both tiers fully scheduled: 6 + 6 = 12 games.
    expect(matches).toHaveLength(12);
  });

  it("never puts two games on the same court at the same time (courts sufficient)", () => {
    const tiers: LeagueTier[] = [
      { divisionId: "rec", teamIds: teams("R", 4) },
      { divisionId: "comp", teamIds: teams("C", 4) },
    ];
    const { matches, maxGamesPerSlot } = planTieredLeagueSchedule(tiers, BASE);
    // Each tier plays one game per night → 2 tiers = 2 games/slot ≤ 4 courts.
    expect(maxGamesPerSlot).toBeLessThanOrEqual(BASE.courts);
    const seen = new Set<string>();
    for (const m of matches) {
      const key = `${m.date}#${m.wave}#${m.courtIndex}`;
      expect(seen.has(key)).toBe(false); // no court double-booked in a slot
      seen.add(key);
    }
  });

  it("flags over-capacity when the tiers' combined games exceed the courts", () => {
    // Two 6-team tiers at 2 games/week → 3 games each per night = 6 in a slot,
    // but only 2 courts.
    const tiers: LeagueTier[] = [
      { divisionId: "a", teamIds: teams("A", 6) },
      { divisionId: "b", teamIds: teams("B", 6) },
    ];
    const { maxGamesPerSlot } = planTieredLeagueSchedule(tiers, {
      ...BASE,
      gamesPerWeek: 2,
      courts: 2,
    });
    expect(maxGamesPerSlot).toBeGreaterThan(2);
  });

  it("handles an odd team count in a tier (a bye each round)", () => {
    const tiers: LeagueTier[] = [{ divisionId: "odd", teamIds: teams("O", 5) }];
    const { matches } = planTieredLeagueSchedule(tiers, BASE);
    // 5 teams, single round robin → C(5,2) = 10 games; no self-matches.
    expect(matches).toHaveLength(10);
    expect(matches.every((m) => m.homeTeamId !== m.awayTeamId)).toBe(true);
  });

  it("skips tiers with fewer than 2 teams", () => {
    const tiers: LeagueTier[] = [
      { divisionId: "full", teamIds: teams("F", 4) },
      { divisionId: "lonely", teamIds: ["X1"] },
      { divisionId: "empty", teamIds: [] },
    ];
    const { matches } = planTieredLeagueSchedule(tiers, BASE);
    expect(matches.every((m) => m.divisionId === "full")).toBe(true);
    expect(matches).toHaveLength(6);
  });

  it("is deterministic for the same input", () => {
    const tiers: LeagueTier[] = [{ divisionId: "d", teamIds: teams("T", 6) }];
    const a = planTieredLeagueSchedule(tiers, BASE);
    const b = planTieredLeagueSchedule(tiers, BASE);
    expect(a.matches).toEqual(b.matches);
  });
});
