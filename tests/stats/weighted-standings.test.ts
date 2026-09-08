import { describe, expect, it } from "vitest";

import {
  weekPoints,
  weightedStandings,
  type TierWeight,
  type WeekPlacement,
} from "@/lib/stats/weighted-standings";

/** Mango Sports' own numbers. */
const T1: TierWeight = {
  divisionId: "t1",
  name: "Tier 1",
  base: 10,
  perSetWin: 5,
};
const T2: TierWeight = {
  divisionId: "t2",
  name: "Tier 2",
  base: 5,
  perSetWin: 2,
};
const WEIGHTS = [T1, T2];

describe("weekPoints", () => {
  it("matches the organizer's worked example", () => {
    // "Team A is in Tier 1, so they automatically have 10. They also won 3
    // sets so that's 15 additional points. In total 25 points for that week."
    const got = weekPoints(
      { teamId: "A", week: 1, divisionId: "t1", setsWon: 3 },
      T1,
    );
    expect(got.base).toBe(10);
    expect(got.fromWins).toBe(15);
    expect(got.total).toBe(25);
  });

  it("prices the same night differently in tier 2", () => {
    // The whole point: three set wins is a harder night at the top.
    const got = weekPoints(
      { teamId: "B", week: 1, divisionId: "t2", setsWon: 3 },
      T2,
    );
    expect(got.total).toBe(11); // 5 + 3 x 2
  });

  it("awards the base for turning up and losing everything", () => {
    // "If you play in tier 1 you automatically get 10 points" — the base is
    // for being there, and it is what makes a hard week worth more than an
    // easy one even when you lose it.
    const got = weekPoints(
      { teamId: "C", week: 2, divisionId: "t1", setsWon: 0 },
      T1,
    );
    expect(got.total).toBe(10);
  });
});

describe("weightedStandings", () => {
  it("adds a team's weeks up across tiers", () => {
    // A ladder team moves. Week 1 in Tier 1 is worth more than week 2 in
    // Tier 2, and that difference is the reason this table exists.
    const placements: WeekPlacement[] = [
      { teamId: "A", week: 1, divisionId: "t1", setsWon: 3 }, // 25
      { teamId: "A", week: 2, divisionId: "t2", setsWon: 3 }, // 11
    ];
    const [row] = weightedStandings(placements, WEIGHTS);
    expect(row.totalPoints).toBe(36);
    expect(row.totalSetsWon).toBe(6);
    expect(row.weeksPlayed).toBe(2);
  });

  it("orders by points, highest first", () => {
    const placements: WeekPlacement[] = [
      { teamId: "low", week: 1, divisionId: "t2", setsWon: 1 }, // 7
      { teamId: "high", week: 1, divisionId: "t1", setsWon: 2 }, // 20
      { teamId: "mid", week: 1, divisionId: "t1", setsWon: 0 }, // 10
    ];
    expect(weightedStandings(placements, WEIGHTS).map((r) => r.teamId)).toEqual(
      ["high", "mid", "low"],
    );
  });

  it("breaks a tie on sets won", () => {
    const placements: WeekPlacement[] = [
      // Both 20: tier 1 with 2 wins, vs tier 2 twice with more sets.
      { teamId: "fewer", week: 1, divisionId: "t1", setsWon: 2 },
      { teamId: "more", week: 1, divisionId: "t2", setsWon: 5 }, // 15
      { teamId: "more", week: 2, divisionId: "t2", setsWon: 0 }, // 5
    ];
    const rows = weightedStandings(placements, WEIGHTS);
    expect(rows[0].totalPoints).toBe(rows[1].totalPoints);
    expect(rows[0].teamId).toBe("more"); // 5 sets beats 2
  });

  it("then favours the team that did it in fewer weeks", () => {
    const placements: WeekPlacement[] = [
      { teamId: "quick", week: 1, divisionId: "t1", setsWon: 2 }, // 20 in 1
      { teamId: "slow", week: 1, divisionId: "t1", setsWon: 1 }, // 15
      { teamId: "slow", week: 2, divisionId: "t2", setsWon: 0 }, // 5 → 20 in 2
    ];
    const rows = weightedStandings(placements, WEIGHTS);
    expect(rows.map((r) => r.teamId)).toEqual(["quick", "slow"]);
  });

  it("skips a tier nobody has priced rather than scoring it zero", () => {
    // A tier with no weight is an unanswered question. Counting it as nothing
    // would quietly tell an organizer the team earned nothing that week.
    const placements: WeekPlacement[] = [
      { teamId: "A", week: 1, divisionId: "t1", setsWon: 2 },
      { teamId: "A", week: 2, divisionId: "unpriced", setsWon: 4 },
    ];
    const [row] = weightedStandings(placements, WEIGHTS);
    expect(row.weeksPlayed).toBe(1);
    expect(row.totalPoints).toBe(20);
  });

  it("lists a team's weeks newest first", () => {
    const placements: WeekPlacement[] = [
      { teamId: "A", week: 1, divisionId: "t1", setsWon: 0 },
      { teamId: "A", week: 3, divisionId: "t1", setsWon: 0 },
      { teamId: "A", week: 2, divisionId: "t2", setsWon: 0 },
    ];
    const [row] = weightedStandings(placements, WEIGHTS);
    expect(row.weeks.map((w) => w.week)).toEqual([3, 2, 1]);
  });

  it("returns nothing for a season nobody has played", () => {
    expect(weightedStandings([], WEIGHTS)).toEqual([]);
  });

  it("returns nothing when no tier has been priced", () => {
    const placements: WeekPlacement[] = [
      { teamId: "A", week: 1, divisionId: "t1", setsWon: 3 },
    ];
    expect(weightedStandings(placements, [])).toEqual([]);
  });
});
