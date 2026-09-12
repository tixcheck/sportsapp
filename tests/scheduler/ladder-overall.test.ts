import { describe, expect, it } from "vitest";

import {
  overallPosition,
  overallStandings,
  positionRange,
  type NightPlacement,
} from "@/lib/scheduler/ladder-overall";

/** Scarborough's eight tiers, top to bottom: 6,4,4,6,6,4,4,6 = 40 teams. */
const SMVA = [6, 4, 4, 6, 6, 4, 4, 6];

const p = (
  teamId: string,
  tierIndex: number,
  rankInTier: number,
): NightPlacement => ({ teamId, tierIndex, rankInTier });

describe("overallPosition", () => {
  // The organizer's own description of the scheme, verbatim: "first in tier 1
  // gets 1 pt, last in last tier gets 40".
  it("gives 1 to the winner of the top gym", () => {
    expect(overallPosition(0, 1, SMVA)).toBe(1);
  });

  it("gives 40 to the bottom of the bottom gym", () => {
    expect(overallPosition(7, 6, SMVA)).toBe(40);
  });

  it("runs straight through the tiers with no gaps or overlaps", () => {
    const seen: number[] = [];
    SMVA.forEach((size, tier) => {
      for (let rank = 1; rank <= size; rank++) {
        seen.push(overallPosition(tier, rank, SMVA));
      }
    });
    expect(seen).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });

  it("puts the bottom of a tier above the top of the next", () => {
    // Last at Bethune (6th of 6) is 6; first at Leacock A is 7.
    expect(overallPosition(0, 6, SMVA)).toBe(6);
    expect(overallPosition(1, 1, SMVA)).toBe(7);
  });

  it("counts every tier above at full size, whatever happened in them", () => {
    // Agincourt is tier 3, so 6+4+4 = 14 teams are above it by definition.
    expect(overallPosition(3, 1, SMVA)).toBe(15);
  });
});

describe("positionRange", () => {
  it("is 1 to 40 for Scarborough", () => {
    expect(positionRange(SMVA)).toEqual({ best: 1, worst: 40 });
  });

  it("is zero-width with no tiers at all", () => {
    expect(positionRange([])).toEqual({ best: 0, worst: 0 });
  });
});

describe("overallStandings", () => {
  // LOWEST total is the top seed. This is the thing most likely to be
  // "corrected" backwards by someone later.
  it("seeds the lowest total first", () => {
    const rows = overallStandings(
      [
        [p("good", 0, 1), p("bad", 7, 6)],
        [p("good", 0, 2), p("bad", 7, 5)],
      ],
      SMVA,
    );
    expect(rows.map((r) => r.teamId)).toEqual(["good", "bad"]);
    expect(rows[0]).toMatchObject({ total: 3, seed: 1, nights: 2 });
    expect(rows[1]).toMatchObject({ total: 79, seed: 2, nights: 2 });
  });

  it("keeps each night's position for the reader", () => {
    const rows = overallStandings(
      [[p("t", 0, 1)], [p("t", 1, 2)], [p("t", 0, 3)]],
      SMVA,
    );
    expect(rows[0].positions).toEqual([1, 8, 3]);
    expect(rows[0].total).toBe(12);
  });

  // Absence is a league rule nobody has stated, so it is neither rewarded nor
  // punished — but the night count has to show the totals are not comparable.
  it("scores a team only for the nights it played", () => {
    const rows = overallStandings(
      [[p("every", 0, 1), p("some", 0, 2)], [p("every", 0, 1)]],
      SMVA,
    );
    const some = rows.find((r) => r.teamId === "some")!;
    const every = rows.find((r) => r.teamId === "every")!;
    expect(every).toMatchObject({ total: 2, nights: 2 });
    expect(some).toMatchObject({ total: 2, nights: 1 });
    // Equal totals over unequal nights: they tie, and `nights` is what tells
    // a reader that is not the same achievement.
    expect(every.seed).toBe(some.seed);
  });

  it("shares a seed on a tie and skips the next", () => {
    const rows = overallStandings(
      [[p("a", 0, 1), p("b", 0, 1 + 0), p("c", 0, 3)]].map((n) => n),
      SMVA,
    );
    // a and b both scored 1, c scored 3.
    expect(rows.map((r) => [r.teamId, r.total, r.seed])).toEqual([
      ["a", 1, 1],
      ["b", 1, 1],
      ["c", 3, 3],
    ]);
  });

  it("is empty when nothing has been played", () => {
    expect(overallStandings([], SMVA)).toEqual([]);
    expect(overallStandings([[]], SMVA)).toEqual([]);
  });

  it("orders stably when totals tie, without that becoming a tiebreak", () => {
    const first = overallStandings([[p("z", 0, 1), p("a", 0, 1)]], SMVA);
    const again = overallStandings([[p("a", 0, 1), p("z", 0, 1)]], SMVA);
    expect(first.map((r) => r.teamId)).toEqual(again.map((r) => r.teamId));
    expect(first.every((r) => r.seed === 1)).toBe(true);
  });

  // A full season shape: everyone plays, totals spread, nobody is lost.
  it("keeps all 40 teams across a multi-week season", () => {
    const week = (offset: number): NightPlacement[] =>
      SMVA.flatMap((size, tier) =>
        Array.from({ length: size }, (_, i) =>
          p(`t${tier}-${i}`, tier, ((i + offset) % size) + 1),
        ),
      );
    const rows = overallStandings([week(0), week(1), week(2)], SMVA);
    expect(rows).toHaveLength(40);
    expect(rows.every((r) => r.nights === 3)).toBe(true);
    expect(rows[0].total).toBeLessThanOrEqual(rows[rows.length - 1].total);
    // Every position awarded three times over: 3 * (1+2+…+40).
    const grand = rows.reduce((a, r) => a + r.total, 0);
    expect(grand).toBe(3 * ((40 * 41) / 2));
  });
});
