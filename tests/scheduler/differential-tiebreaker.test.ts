import { describe, expect, it } from "vitest";

import { rankStandings, type MatchResult } from "@/lib/scheduler/tiebreakers";

/** A 2-set match the home team wins with the given per-set points. */
function win(home: string, away: string, hp: number, ap: number): MatchResult {
  return {
    homeTeamId: home,
    awayTeamId: away,
    sets: [
      { home: hp, away: ap },
      { home: hp, away: ap },
    ],
  };
}

describe("rankStandings — point-differential mode", () => {
  // A and B each win one match and never play each other (tied on match wins +
  // head-to-head). A wins by a bigger margin but a WORSE ratio than B, so the
  // two modes disagree — the perfect test of which criterion is in effect.
  //   A beats P 50–25, 50–25  → PF 100, PA 50 → diff +50, ratio 2.0
  //   B beats Q 30–10, 30–10  → PF 60,  PA 20 → diff +40, ratio 3.0
  const matches: MatchResult[] = [win("A", "P", 50, 25), win("B", "Q", 30, 10)];
  const teams = ["A", "B", "P", "Q"];

  it("ranks by point ratio in the default OVA mode (B over A)", () => {
    const rows = rankStandings(teams, matches);
    expect(rows.slice(0, 2).map((r) => r.teamId)).toEqual(["B", "A"]);
  });

  it("ranks by point differential in differential mode (A over B)", () => {
    const rows = rankStandings(teams, matches, undefined, "differential");
    expect(rows.slice(0, 2).map((r) => r.teamId)).toEqual(["A", "B"]);
    const a = rows.find((r) => r.teamId === "A")!;
    expect(a.explanation).toContain("Point differential");
    expect(a.explanation).toContain("+50");
  });

  it("still resolves outright match-win leaders before the tiebreak", () => {
    // C wins twice → clear first regardless of mode.
    const ms: MatchResult[] = [
      win("C", "A", 21, 10),
      win("C", "B", 21, 10),
      win("A", "B", 21, 10),
    ];
    const rows = rankStandings(["A", "B", "C"], ms, undefined, "differential");
    expect(rows[0]).toMatchObject({ teamId: "C", tiebreakerStep: 1 });
  });
});
