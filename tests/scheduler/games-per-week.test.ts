import { describe, expect, it } from "vitest";

import { generateRoundRobin } from "@/lib/scheduler/round-robin";

function teams(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `T${i + 1}`);
}

const distinctDates = (rounds: { date: string }[]) => [
  ...new Set(rounds.map((r) => r.date)),
];

describe("generateRoundRobin — games per week", () => {
  it("defaults to one game per week (a distinct date per round)", () => {
    const { rounds } = generateRoundRobin({
      teamIds: teams(6),
      courts: 3,
      startDate: "2026-07-14",
    });
    expect(distinctDates(rounds).length).toBe(rounds.length);
    expect(rounds.every((r) => r.wave === 0)).toBe(true);
  });

  it("packs 2 games per week onto shared dates with alternating waves", () => {
    const { rounds } = generateRoundRobin({
      teamIds: teams(12), // single RR = 11 rounds
      courts: 6,
      startDate: "2026-07-14",
      gamesPerWeek: 2,
    });
    // 11 rounds at 2/week → 6 weeks.
    expect(distinctDates(rounds).length).toBe(6);
    expect(rounds.map((r) => r.wave).slice(0, 4)).toEqual([0, 1, 0, 1]);
    expect(rounds[0].date).toBe(rounds[1].date); // same night
    expect(rounds[2].date).toBe(rounds[3].date);
    expect(rounds[0].date).not.toBe(rounds[2].date); // next week
  });

  it("spaces weeks 7 days apart", () => {
    const { rounds } = generateRoundRobin({
      teamIds: teams(8), // 7 rounds → 4 weeks at 2/week
      courts: 4,
      startDate: "2026-07-14",
      gamesPerWeek: 2,
    });
    const dates = distinctDates(rounds);
    expect(dates.slice(0, 3)).toEqual([
      "2026-07-14",
      "2026-07-21",
      "2026-07-28",
    ]);
  });

  it("skips blackout dates at week boundaries", () => {
    const { rounds } = generateRoundRobin({
      teamIds: teams(6),
      courts: 3,
      startDate: "2026-07-14",
      gamesPerWeek: 2,
      blackoutDates: ["2026-07-21"],
    });
    const dates = distinctDates(rounds);
    expect(dates).not.toContain("2026-07-21");
    expect(dates[1]).toBe("2026-07-28");
  });
});
