import { describe, expect, it } from "vitest";

import { weeklyTallies } from "@/lib/standings/weekly";

describe("weeklyTallies", () => {
  it("tallies wins and losses per night, oldest first", () => {
    const weeks = weeklyTallies([
      { date: "2026-07-21", outcome: "win" },
      { date: "2026-07-14", outcome: "win" },
      { date: "2026-07-14", outcome: "loss" },
      { date: "2026-07-21", outcome: "loss" },
    ]);
    expect(weeks).toEqual([
      { date: "2026-07-14", won: 1, lost: 1, tied: 0 },
      { date: "2026-07-21", won: 1, lost: 1, tied: 0 },
    ]);
  });

  it("counts ties separately", () => {
    const weeks = weeklyTallies([
      { date: "2026-07-14", outcome: "win" },
      { date: "2026-07-14", outcome: "tie" },
    ]);
    expect(weeks).toEqual([{ date: "2026-07-14", won: 1, lost: 0, tied: 1 }]);
  });

  it("returns an empty list for no results", () => {
    expect(weeklyTallies([])).toEqual([]);
  });
});
