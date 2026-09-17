/**
 * Placement scoring — Mango's Fall season, where a LOW score is the good one.
 *
 * "Top team will get 1, 18th team will get 18. The more the points the lower
 * they end up." Six tiers of three, bases 1/4/7/10/13/16.
 */
import { describe, expect, it } from "vitest";

import {
  placementStandings,
  weekScore,
  type PlacementTier,
  type WeekFinish,
} from "@/lib/stats/placement-standings";

const TIERS: PlacementTier[] = [
  { divisionId: "t1", name: "Tier 1", base: 1 },
  { divisionId: "t2", name: "Tier 2", base: 4 },
  { divisionId: "t3", name: "Tier 3", base: 7 },
  { divisionId: "t4", name: "Tier 4", base: 10 },
  { divisionId: "t5", name: "Tier 5", base: 13 },
  { divisionId: "t6", name: "Tier 6", base: 16 },
];

const tier = (id: string) => TIERS.find((t) => t.divisionId === id)!;

/** A finish that definitely has a rank — what `weekScore` takes. */
const played = (divisionId: string, rank: number, week = 1) => ({
  teamId: "a",
  week,
  divisionId,
  rank,
});

/** A finish that may have no result yet — what the table takes. */
const finish = (
  teamId: string,
  divisionId: string,
  rank: number | null,
  week = 1,
): WeekFinish => ({ teamId, week, divisionId, rank });

describe("weekScore", () => {
  it("is the tier's number plus how far down you came", () => {
    expect(weekScore(played("t1", 1), tier("t1")).score).toBe(1);
    expect(weekScore(played("t1", 3), tier("t1")).score).toBe(3);
    expect(weekScore(played("t2", 1), tier("t2")).score).toBe(4);
    expect(weekScore(played("t6", 3), tier("t6")).score).toBe(18);
  });
});

describe("placementStandings", () => {
  // The whole scheme in one assertion: six tiers of three produce 1..18 with
  // no gaps and no collisions.
  it("a full ladder night scores exactly 1 through 18", () => {
    const finishes = TIERS.flatMap((t) =>
      [1, 2, 3].map((rank) =>
        finish(`${t.divisionId}-${rank}`, t.divisionId, rank),
      ),
    );
    const rows = placementStandings(finishes, TIERS);
    expect(rows).toHaveLength(18);
    expect(rows.map((r) => r.totalScore)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
    expect(rows[0].teamId).toBe("t1-1");
    expect(rows[17].teamId).toBe("t6-3");
  });

  it("sorts lowest first — the opposite of the weighted table", () => {
    const rows = placementStandings(
      [
        finish("high", "t6", 3), // 18
        finish("low", "t1", 1), // 1
        finish("mid", "t3", 2), // 8
      ],
      TIERS,
    );
    expect(rows.map((r) => r.teamId)).toEqual(["low", "mid", "high"]);
  });

  it("adds a team's nights up across weeks", () => {
    const rows = placementStandings(
      [
        finish("a", "t1", 2, 1), // 2
        finish("a", "t2", 1, 2), // 4
        finish("a", "t1", 3, 3), // 3
      ],
      TIERS,
    );
    expect(rows[0]).toMatchObject({
      totalScore: 9,
      weeksPlayed: 3,
      bestWeek: 2,
    });
  });

  it("shows weeks newest first", () => {
    const rows = placementStandings(
      [finish("a", "t1", 1, 1), finish("a", "t2", 1, 2)],
      TIERS,
    );
    expect(rows[0].weeks.map((w) => w.week)).toEqual([2, 1]);
  });

  // Zero would beat winning Tier 1, which is the one result this must not
  // invent out of a night nobody has recorded.
  it("skips a night with no result rather than scoring it zero", () => {
    const rows = placementStandings(
      [finish("a", "t1", 1, 1), finish("a", "t1", null, 2)],
      TIERS,
    );
    expect(rows[0]).toMatchObject({ totalScore: 1, weeksPlayed: 1 });
  });

  it("skips a tier with no number configured", () => {
    const rows = placementStandings(
      [finish("a", "t1", 1), finish("a", "unpriced", 1)],
      TIERS,
    );
    expect(rows[0]).toMatchObject({ totalScore: 1, weeksPlayed: 1 });
  });

  // Absence lowers a total, which under "low is good" flatters it. More nights
  // on the same total is the tiebreak that pushes back.
  it("ranks more nights ahead of fewer on an equal total", () => {
    const rows = placementStandings(
      [
        finish("lazy", "t4", 1, 1), // 10 in one night
        finish("busy", "t1", 1, 1), // 1
        finish("busy", "t1", 1, 2), // 1
        finish("busy", "t3", 2, 3), // 8  -> also 10, over three nights
      ],
      TIERS,
    );
    expect(rows[0].totalScore).toBe(rows[1].totalScore);
    expect(rows[0].teamId).toBe("busy");
    expect(rows[0].weeksPlayed).toBe(3);
  });

  it("handles an empty season", () => {
    expect(placementStandings([], TIERS)).toEqual([]);
  });
});
