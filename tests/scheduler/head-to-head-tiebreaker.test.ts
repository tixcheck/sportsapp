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

/**
 * The second head-to-head pass. Mango's tiers are three teams meeting twice, so
 * two sides splitting their pair is routine — and the organizer's rule is that
 * the margin across those two games settles it: "in the 2 games Beijing and
 * kochi played, beijing came in on top by 1 point. And they need to be top."
 */
describe("rankStandings — head-to-head points, when the meetings are level", () => {
  // Beijing/Kochi as actually played, week 1 Tier 3. One win each; Beijing 46
  // points across the pair to Kochi's 45.
  const TIER: MatchResult[] = [
    m("Kochi", "Beijing", single(20, 25)), // Beijing by 5
    m("Kochi", "Beijing", single(25, 21)), // Kochi by 4
    m("Kochi", "Toronto", single(25, 14)),
    m("Kochi", "Toronto", single(25, 18)),
    m("Toronto", "Beijing", single(14, 25)),
    m("Toronto", "Beijing", single(21, 25)),
  ];

  it("gives it to the better margin across the two meetings", () => {
    const rows = rankStandings(
      ["Kochi", "Beijing", "Toronto"],
      TIER,
      undefined,
      "headToHead",
    );
    expect(rows.map((r) => r.teamId)).toEqual(["Beijing", "Kochi", "Toronto"]);
    // Step 3 is the points pass: wins were level, so it went one further.
    expect(rows[0]).toMatchObject({ teamId: "Beijing", tiebreakerStep: 3 });
    expect(rows[0].explanation).toContain("Head-to-head points");
  });

  // The rule it must NOT become: OVA reads the same games the other way, on
  // overall point ratio, and puts Kochi first. That is the result the organizer
  // was disputing.
  it("differs from OVA on the same tier", () => {
    const ova = rankStandings(["Kochi", "Beijing", "Toronto"], TIER);
    expect(ova[0].teamId).toBe("Kochi");
  });

  it("does not reach points when one side won the meetings outright", () => {
    const rows = rankStandings(
      ["A", "B", "C"],
      [
        m("A", "B", single(21, 19)), // A wins both meetings narrowly
        m("A", "B", single(21, 19)),
        m("A", "C", single(21, 10)),
        m("C", "A", single(21, 10)),
        m("B", "C", single(25, 5)), // B racks up points elsewhere
        m("C", "B", single(5, 25)),
      ],
      undefined,
      "headToHead",
    );
    const a = rows.find((r) => r.teamId === "A")!;
    const b = rows.find((r) => r.teamId === "B")!;
    // A beat B twice, so it resolves at the wins pass and the margin never
    // matters — B's blowouts against C cannot buy it the tier.
    expect(a.position).toBeLessThan(b.position);
    expect(a.tiebreakerStep).toBeLessThanOrEqual(2);
  });

  /**
   * Three level teams, which is where "best margin" and "most points scored"
   * part company: Mangalore scored the most (90) and has the worst margin (−4).
   * The organizer chose differential, so Kingston (+3) tops it.
   */
  it("separates a three-way tie by margin, not by points scored", () => {
    // Mango's Tier 5, week 1, exactly as played — all three finished on 2 wins.
    const rows = rankStandings(
      ["Mangalore", "Kingston", "Mississauga"],
      [
        m("Kingston", "Mississauga", single(16, 25)),
        m("Mangalore", "Mississauga", single(25, 22)),
        m("Kingston", "Mississauga", single(21, 14)),
        m("Mangalore", "Kingston", single(17, 25)),
        m("Mangalore", "Mississauga", single(23, 25)),
        m("Mangalore", "Kingston", single(25, 22)),
      ],
      undefined,
      "headToHead",
    );
    // Margins: Kingston 84/81 = +3, Mississauga 86/85 = +1,
    // Mangalore 90/94 = −4. Mangalore scored the MOST points and still comes
    // last, which is the whole distinction the organizer chose.
    expect(rows.map((r) => r.teamId)).toEqual([
      "Kingston",
      "Mississauga",
      "Mangalore",
    ]);
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
