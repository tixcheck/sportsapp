import { describe, expect, it } from "vitest";

import {
  assignBracketTimes,
  bracketSlotKey,
  dualBracketMatches,
} from "@/lib/scheduler/bracket";

const FOUR = ["s1", "s2", "s3", "s4"];

describe("third-place game", () => {
  /**
   * The organizer's playoff: "1st seed plays the 4th seed, 2nd plays the 3rd,
   * then the winners play and the losers play."
   */
  it("adds a game beside the final, fed by the semi losers", () => {
    const matches = dualBracketMatches({
      championship: FOUR,
      thirdPlace: true,
    });

    // Two semis in round 1, then the final and the 3rd-place game in round 2.
    expect(matches.filter((m) => m.round === 1)).toEqual([
      {
        round: 1,
        position: 1,
        homeTeamId: "s1",
        awayTeamId: "s4",
        track: null,
      },
      {
        round: 1,
        position: 2,
        homeTeamId: "s2",
        awayTeamId: "s3",
        track: null,
      },
    ]);

    const round2 = matches.filter((m) => m.round === 2);
    expect(round2).toHaveLength(2);
    const final = round2.find((m) => m.position === 1)!;
    const third = round2.find((m) => m.position === 2)!;

    expect(final.isThirdPlace).toBeUndefined();
    expect(third.isThirdPlace).toBe(true);
    // Both start empty — the semis decide who plays in them.
    expect([third.homeTeamId, third.awayTeamId]).toEqual([null, null]);
  });

  it("is off by default, leaving the bracket exactly as it was", () => {
    expect(dualBracketMatches({ championship: FOUR })).toEqual(
      dualBracketMatches({ championship: FOUR, thirdPlace: false }),
    );
    expect(
      dualBracketMatches({ championship: FOUR }).some((m) => m.isThirdPlace),
    ).toBe(false);
  });

  it("is skipped when there are no semi-finals to lose", () => {
    // Two teams is a final on its own.
    const matches = dualBracketMatches({
      championship: ["a", "b"],
      thirdPlace: true,
    });
    expect(matches.some((m) => m.isThirdPlace)).toBe(false);
  });

  it("scales to an eight-team bracket", () => {
    const eight = Array.from({ length: 8 }, (_, i) => `s${i + 1}`);
    const matches = dualBracketMatches({
      championship: eight,
      thirdPlace: true,
    });
    const third = matches.find((m) => m.isThirdPlace)!;
    // Round 3 is the final round; the 3rd-place game sits beside it.
    expect(third.round).toBe(3);
    expect(third.position).toBe(2);
  });

  it("starts only after both semis have finished", () => {
    const matches = dualBracketMatches({
      championship: FOUR,
      thirdPlace: true,
    });
    const start = 1_000_000;
    const slot = 60 * 60_000;

    const times = assignBracketTimes(
      matches.map((m) => ({
        round: m.round,
        position: m.position,
        track: m.track,
        // Semis on two courts; final and 3rd place likewise.
        court: m.position === 1 ? 1 : 2,
        isThirdPlace: m.isThirdPlace,
      })),
      start,
      slot,
    );

    const at = (round: number, position: number) =>
      times.get(bracketSlotKey(null, round, position));

    const semiEnd = start + slot;
    expect(at(1, 1)).toBe(start); // semi 1
    expect(at(1, 2)).toBe(start); // semi 2
    expect(at(2, 1)).toBe(semiEnd); // final
    // The bug this guards: without knowing its feeders are positions 1 and 2,
    // the 3rd-place game floors at the bracket start and gets scheduled before
    // the semis that decide who is in it.
    expect(at(2, 2)).toBe(semiEnd);
  });
});
