import { describe, expect, it } from "vitest";

import type { ScheduleMatch } from "@/lib/queries/leagues";
import { buildMatchupMatrix } from "@/lib/schedule/matchup-matrix";

/** A minimal game between two named teams (ids == names here for clarity). */
function game(
  home: string,
  away: string,
  ref: string | null = null,
): ScheduleMatch {
  return {
    id: `${home}-${away}-${Math.random()}`,
    round: 1,
    scheduledAt: null,
    court: null,
    status: "scheduled",
    homeTeamId: home,
    awayTeamId: away,
    homeTeamName: home,
    awayTeamName: away,
    refTeamId: ref,
    refTeamName: ref,
    isAbnormal: false,
    sets: [],
  };
}

describe("buildMatchupMatrix", () => {
  it("counts each pair symmetrically and orders teams by name", () => {
    const { teams, counts } = buildMatchupMatrix([
      game("B", "A"),
      game("A", "C"),
    ]);
    expect(teams.map((t) => t.name)).toEqual(["A", "B", "C"]);
    // A-B once, A-C once, B-C never.
    const [A, B, C] = [0, 1, 2];
    expect(counts[A][B]).toBe(1);
    expect(counts[B][A]).toBe(1);
    expect(counts[A][C]).toBe(1);
    expect(counts[B][C]).toBe(0);
    expect(counts[A][A]).toBe(0); // diagonal
  });

  it("flags a full round robin as everyone-plays-everyone", () => {
    const m = buildMatchupMatrix([
      game("A", "B"),
      game("A", "C"),
      game("B", "C"),
    ]);
    expect(m.everyonePlaysEveryone).toBe(true);
    expect(m.maxRepeat).toBe(1);
  });

  it("detects a missing pairing", () => {
    const m = buildMatchupMatrix([game("A", "B"), game("A", "C")]);
    expect(m.everyonePlaysEveryone).toBe(false); // B never meets C
  });

  it("reports the largest repeat count", () => {
    const m = buildMatchupMatrix([
      game("A", "B"),
      game("B", "A"), // rematch
      game("A", "C"),
      game("B", "C"),
    ]);
    expect(m.counts[0][1]).toBe(2); // A-B twice
    expect(m.maxRepeat).toBe(2);
    expect(m.everyonePlaysEveryone).toBe(true);
  });

  it("skips byes and ignores ref-only teams", () => {
    const refereed = game("A", "B", "C"); // C only referees
    // A bye placeholder (one side missing) contributes no matchup.
    const bye: ScheduleMatch = { ...game("A", "X"), awayTeamId: null };
    const m = buildMatchupMatrix([refereed, bye]);
    // Only A and B ever play; C refereed and the bye's opponent is absent.
    expect(m.teams.map((t) => t.name)).toEqual(["A", "B"]);
    expect(m.counts[0][1]).toBe(1);
  });
});
