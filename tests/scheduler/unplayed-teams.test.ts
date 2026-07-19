import { describe, expect, it } from "vitest";

import { rankStandings, type MatchResult } from "@/lib/scheduler/tiebreakers";

/** `n` games where `w` beats `l` 2–0 by the given set score. */
function beats(
  w: string,
  l: string,
  n: number,
  score: [number, number] = [21, 10],
): MatchResult[] {
  return Array.from({ length: n }, () => ({
    homeTeamId: w,
    awayTeamId: l,
    sets: [
      { home: score[0], away: score[1] },
      { home: score[0], away: score[1] },
    ],
  }));
}

describe("rankStandings — teams that haven't played", () => {
  // The real bug: point-differential league. "loser" went 0–2 (negative diff);
  // "newbie" hasn't played (diff 0). 0 must not outrank a negative.
  const matches = beats("winner", "loser", 2);

  it("ranks an unplayed team BELOW a team that played and lost (differential)", () => {
    const rows = rankStandings(
      ["newbie", "winner", "loser"],
      matches,
      undefined,
      "differential",
    );
    expect(rows.map((r) => r.teamId)).toEqual(["winner", "loser", "newbie"]);
  });

  it("also keeps unplayed teams last in OVA mode", () => {
    const rows = rankStandings(
      ["newbie", "winner", "loser"],
      matches,
      undefined,
      "ova",
    );
    expect(rows[rows.length - 1].teamId).toBe("newbie");
  });

  it("puts every unplayed team below every played one, regardless of input order", () => {
    const rows = rankStandings(
      ["ghost1", "loser", "ghost2", "winner"],
      matches,
      undefined,
      "differential",
    );
    // Played teams first (winner, loser), then the two unplayed at the bottom.
    expect(rows.slice(0, 2).map((r) => r.teamId)).toEqual(["winner", "loser"]);
    expect(new Set(rows.slice(2).map((r) => r.teamId))).toEqual(
      new Set(["ghost1", "ghost2"]),
    );
  });

  it("still ranks normally when everyone has played", () => {
    const rows = rankStandings(
      ["winner", "loser"],
      matches,
      undefined,
      "differential",
    );
    expect(rows.map((r) => r.teamId)).toEqual(["winner", "loser"]);
  });

  it("handles a competition where no one has played yet (input order)", () => {
    const rows = rankStandings(["a", "b", "c"], [], undefined, "differential");
    expect(rows.map((r) => r.teamId)).toEqual(["a", "b", "c"]);
    expect(rows.every((r) => r.mw === 0)).toBe(true);
  });
});
