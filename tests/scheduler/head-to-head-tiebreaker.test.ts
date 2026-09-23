import { describe, expect, it } from "vitest";

import {
  parseRankMode,
  rankStandings,
  type MatchResult,
} from "@/lib/scheduler/tiebreakers";

function m(home: string, away: string, sets: [number, number][]): MatchResult {
  return {
    homeTeamId: home,
    awayTeamId: away,
    sets: sets.map(([h, a]) => ({ home: h, away: a })),
  };
}

const single = (h: number, a: number): [number, number][] => [[h, a]];

/**
 * The fixture that separates the two hierarchies.
 *
 * A and B both finish on 2 wins with identical set ratios. A beat B, narrowly.
 * B has by far the better point ratio, having crushed the teams it did beat.
 * So "who beat whom" and "who has the better average" give opposite answers —
 * which is exactly the disagreement Mango's organizer raised: "your team and
 * kochi yesterday … tied 3-3, but you beat them by 1 point. Head to head."
 */
const MATCHES: MatchResult[] = [
  m("A", "B", single(21, 20)), // A edges B
  m("A", "C", single(21, 20)), // A edges C
  m("D", "A", single(21, 10)), // A loses to D
  m("B", "C", single(21, 2)), // B crushes C
  m("B", "D", single(21, 2)), // B crushes D
];
const TEAMS = ["A", "B", "C", "D"];

describe("rankStandings — head-to-head-first mode", () => {
  it("puts the team that won the meeting above the better ratio", () => {
    const rows = rankStandings(TEAMS, MATCHES, undefined, "headToHead");
    expect(rows.slice(0, 2).map((r) => r.teamId)).toEqual(["A", "B"]);
    // Resolved at step 2, which is head-to-head in this mode.
    expect(rows[0]).toMatchObject({ teamId: "A", tiebreakerStep: 2 });
    expect(rows[0].explanation).toContain("Head-to-head");
  });

  // The same fixture, the other way round: proof the mode is doing the work
  // rather than the fixture having one obvious answer.
  it("is the opposite of what OVA does with the identical fixture", () => {
    const ova = rankStandings(TEAMS, MATCHES);
    const h2h = rankStandings(TEAMS, MATCHES, undefined, "headToHead");
    expect(ova.slice(0, 2).map((r) => r.teamId)).toEqual(["B", "A"]);
    expect(h2h.slice(0, 2).map((r) => r.teamId)).toEqual(["A", "B"]);
  });

  it("still resolves an outright winner on match wins first", () => {
    const rows = rankStandings(
      ["A", "B", "C"],
      [
        m("C", "A", single(21, 10)),
        m("C", "B", single(21, 10)),
        m("A", "B", single(21, 10)),
      ],
      undefined,
      "headToHead",
    );
    expect(rows[0]).toMatchObject({ teamId: "C", tiebreakerStep: 1 });
  });

  /**
   * Mango's real shape: three teams, each pair meeting twice. When two sides
   * split their meetings head-to-head separates nobody, and the order has to
   * fall through to the ratios — which is the "if there is a tie then points"
   * half of what was asked for.
   */
  it("falls through to the ratios when the meetings were split", () => {
    const rows = rankStandings(
      ["A", "B", "C"],
      [
        m("A", "B", single(21, 12)), // A wins the first meeting big
        m("B", "A", single(21, 20)), // B wins the second, narrowly
        m("A", "C", single(21, 10)),
        m("C", "A", single(21, 10)),
        m("B", "C", single(21, 19)),
        m("C", "B", single(21, 19)),
      ],
      undefined,
      "headToHead",
    );
    // A and B each won two of four; head-to-head is 1–1 and cannot separate
    // them, so the resolving step is past it.
    const a = rows.find((r) => r.teamId === "A")!;
    expect(a.tiebreakerStep).toBeGreaterThan(2);
  });
});

describe("parseRankMode", () => {
  it("reads every mode the settings column can hold", () => {
    expect(parseRankMode("ova")).toBe("ova");
    expect(parseRankMode("differential")).toBe("differential");
    expect(parseRankMode("headToHead")).toBe("headToHead");
  });

  /**
   * The short-team projection rides on this same column as a suffix, so a
   * direct comparison silently loses the mode. `team-view.ts` did exactly that
   * and showed ratio columns to a league ranking on differential.
   */
  it("sees through the _projected suffix", () => {
    expect(parseRankMode("differential_projected")).toBe("differential");
    expect(parseRankMode("headToHead_projected")).toBe("headToHead");
    expect(parseRankMode("ova_projected")).toBe("ova");
  });

  it("falls back to ova for anything unrecognised", () => {
    // Never throw on a stored value: the lock action casts the raw string, so
    // a mode the readers reject would rank promotions and standings apart.
    expect(parseRankMode(null)).toBe("ova");
    expect(parseRankMode(undefined)).toBe("ova");
    expect(parseRankMode("")).toBe("ova");
    expect(parseRankMode("something-else")).toBe("ova");
  });
});
