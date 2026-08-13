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

describe("venue-aware court assignment", () => {
  const base = {
    startDate: "2026-03-12",
    gamesPerWeek: 1,
    courts: 3,
  };

  const A = ["a1", "a2", "a3", "a4", "a5", "a6"];
  const B = ["b1", "b2", "b3", "b4", "b5", "b6"];

  it("hands out courts per building, so two gyms both use Court 1", () => {
    const { matches } = planTieredLeagueSchedule(
      [
        { divisionId: "dA", teamIds: A, venueId: "v1" },
        { divisionId: "dB", teamIds: B, venueId: "v2" },
      ],
      {
        ...base,
        venues: [
          { venueId: "v1", courts: 3 },
          { venueId: "v2", courts: 3 },
        ],
      },
    );

    const firstSlot = matches.filter(
      (m) => m.date === matches[0].date && m.wave === 0,
    );
    const v1 = firstSlot.filter((m) => m.venueId === "v1");
    const v2 = firstSlot.filter((m) => m.venueId === "v2");

    // Three games each, courts 1-3 at BOTH venues — the whole point.
    expect(v1.map((m) => m.courtIndex).sort()).toEqual([1, 2, 3]);
    expect(v2.map((m) => m.courtIndex).sort()).toEqual([1, 2, 3]);
  });

  it("never puts two games on one court within a building", () => {
    const { matches } = planTieredLeagueSchedule(
      [
        { divisionId: "dA", teamIds: A, venueId: "v1" },
        { divisionId: "dB", teamIds: B, venueId: "v1" },
      ],
      { ...base, venues: [{ venueId: "v1", courts: 6 }] },
    );
    const seen = new Set<string>();
    for (const m of matches) {
      const key = `${m.venueId}|${m.date}|${m.wave}|${m.courtIndex}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("carries the tier's venue onto every one of its games", () => {
    const { matches } = planTieredLeagueSchedule(
      [{ divisionId: "dA", teamIds: A, venueId: "v1" }],
      { ...base, venues: [{ venueId: "v1", courts: 3 }] },
    );
    expect(matches.every((m) => m.venueId === "v1")).toBe(true);
  });

  it("reports a gym asked to host more games at once than it has courts", () => {
    const { overCapacity } = planTieredLeagueSchedule(
      [
        { divisionId: "dA", teamIds: A, venueId: "v1" },
        { divisionId: "dB", teamIds: B, venueId: "v1" },
      ],
      // Six simultaneous games into a 3-court gym.
      { ...base, venues: [{ venueId: "v1", courts: 3 }] },
    );
    expect(overCapacity).toHaveLength(1);
    expect(overCapacity[0]).toMatchObject({
      venueId: "v1",
      courts: 3,
      needed: 6,
    });
  });

  it("reports nothing when every venue fits", () => {
    const { overCapacity } = planTieredLeagueSchedule(
      [
        { divisionId: "dA", teamIds: A, venueId: "v1" },
        { divisionId: "dB", teamIds: B, venueId: "v2" },
      ],
      {
        ...base,
        venues: [
          { venueId: "v1", courts: 3 },
          { venueId: "v2", courts: 3 },
        ],
      },
    );
    expect(overCapacity).toEqual([]);
  });

  it("behaves exactly as before when no venues are given", () => {
    const without = planTieredLeagueSchedule(
      [
        { divisionId: "dA", teamIds: A },
        { divisionId: "dB", teamIds: B },
      ],
      { ...base, courts: 6 },
    );
    // One global pool: six distinct courts in the opening slot, no venues.
    const firstSlot = without.matches.filter(
      (m) => m.date === without.matches[0].date && m.wave === 0,
    );
    expect(new Set(firstSlot.map((m) => m.courtIndex)).size).toBe(6);
    expect(without.matches.every((m) => m.venueId === null)).toBe(true);
    expect(without.overCapacity).toEqual([]);
  });
});
