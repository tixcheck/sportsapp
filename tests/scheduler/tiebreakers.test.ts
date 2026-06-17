import { describe, expect, it } from "vitest";

import {
  computeStats,
  headToHeadTable,
  matchWinner,
  rankStandings,
  type MatchResult,
  type TeamId,
} from "@/lib/scheduler/tiebreakers";

/** Build a match; pass set tuples [home, away]. */
function m(
  home: TeamId,
  away: TeamId,
  sets: [number, number][],
  forfeitedBy?: TeamId,
): MatchResult {
  return {
    homeTeamId: home,
    awayTeamId: away,
    sets: sets.map(([h, a]) => ({ home: h, away: a })),
    forfeitedBy: forfeitedBy ?? null,
  };
}

const SWEEP: [number, number][] = [
  [25, 10],
  [25, 10],
];

describe("matchWinner", () => {
  it("decides by sets won", () => {
    expect(matchWinner(m("A", "B", SWEEP))).toBe("A");
    expect(
      matchWinner(
        m("A", "B", [
          [20, 25],
          [18, 25],
        ]),
      ),
    ).toBe("B");
  });

  it("returns null for an undecided (1–1) match", () => {
    expect(
      matchWinner(
        m("A", "B", [
          [25, 20],
          [20, 25],
        ]),
      ),
    ).toBeNull();
  });

  it("forfeit awards the win to the opponent, overriding sets", () => {
    // A 'wins' on the court but forfeited → B is credited.
    expect(matchWinner(m("A", "B", SWEEP, "A"))).toBe("B");
    expect(matchWinner(m("A", "B", [], "A"))).toBe("B");
  });
});

describe("computeStats", () => {
  it("aggregates MW/ML/SW/SL/PF/PA and ratios", () => {
    const stats = computeStats(
      ["A", "B"],
      [
        m("A", "B", [
          [25, 20],
          [25, 22],
        ]),
      ],
    );
    const a = stats.get("A")!;
    expect(a.mw).toBe(1);
    expect(a.ml).toBe(0);
    expect(a.sw).toBe(2);
    expect(a.sl).toBe(0);
    expect(a.pf).toBe(50);
    expect(a.pa).toBe(42);
    expect(a.setRatio).toBe(Infinity); // SL = 0, SW > 0
    const b = stats.get("B")!;
    expect(b.setRatio).toBe(0); // SW = 0
  });

  it("guards division by zero for a team with no matches", () => {
    const stats = computeStats(["A", "Z"], [m("A", "Z", SWEEP)]);
    const z = stats.get("A")!; // A won, has matches
    expect(z.setRatio).toBe(Infinity);
    const stats2 = computeStats(["NoGames"], []);
    const n = stats2.get("NoGames")!;
    expect(n.setRatio).toBe(0);
    expect(n.pointRatio).toBe(0);
    expect(n.mw).toBe(0);
  });
});

describe("rankStandings — step 1 (match wins)", () => {
  it("orders by match wins when all distinct", () => {
    const rows = rankStandings(
      ["A", "B", "C"],
      [m("A", "B", SWEEP), m("A", "C", SWEEP), m("B", "C", SWEEP)],
    );
    expect(rows.map((r) => r.teamId)).toEqual(["A", "B", "C"]);
    expect(rows.every((r) => r.tiebreakerStep === 1)).toBe(true);
  });

  it("ranks a single team and an empty field", () => {
    expect(rankStandings(["A"], [])).toEqual([
      expect.objectContaining({ teamId: "A", position: 1, tiebreakerStep: 1 }),
    ]);
    expect(rankStandings([], [])).toEqual([]);
  });
});

describe("rankStandings — step 2 (head-to-head)", () => {
  it("breaks a two-way tie by who won head-to-head", () => {
    // A,B tied at 2 wins; A beat B; D=1, C=0 (unique → step 1).
    const rows = rankStandings(
      ["A", "B", "C", "D"],
      [
        m("A", "B", SWEEP),
        m("A", "C", SWEEP),
        m("D", "A", SWEEP),
        m("B", "C", SWEEP),
        m("B", "D", SWEEP),
      ],
    );
    expect(rows.map((r) => r.teamId)).toEqual(["A", "B", "D", "C"]);
    expect(rows[0].tiebreakerStep).toBe(2);
    expect(rows[1].tiebreakerStep).toBe(2);
    expect(rows[2].tiebreakerStep).toBe(1); // D, unique win count
    expect(rows[3].tiebreakerStep).toBe(1); // C
  });
});

describe("rankStandings — step 3 (set ratio)", () => {
  it("breaks a split (1–1) two-way tie by set ratio", () => {
    const rows = rankStandings(
      ["A", "B"],
      [
        m("A", "B", [
          [25, 20],
          [20, 25],
          [15, 10],
        ]), // A wins 2–1
        m("B", "A", SWEEP), // B wins 2–0
      ],
    );
    // A: sw 2 sl 3 = 0.667; B: sw 3 sl 2 = 1.5 → B first.
    expect(rows.map((r) => r.teamId)).toEqual(["B", "A"]);
    expect(rows.every((r) => r.tiebreakerStep === 3)).toBe(true);
  });

  it("falls through a 3-way circular head-to-head to set ratio", () => {
    const rows = rankStandings(
      ["A", "B", "C"],
      [
        m("A", "B", SWEEP), // A sw2 sl0
        m("B", "C", [
          [25, 20],
          [20, 25],
          [15, 12],
        ]), // B 2–1
        m("C", "A", SWEEP), // C sw2 sl0
      ],
    );
    // setRatios: C=3/2=1.5, A=2/2=1, B=2/3=0.667 → C, A, B
    expect(rows.map((r) => r.teamId)).toEqual(["C", "A", "B"]);
    expect(rows.every((r) => r.tiebreakerStep === 3)).toBe(true);
  });

  it("ranks an infinite set ratio (SL=0) above a finite one", () => {
    const rows = rankStandings(
      ["A", "B", "C", "D"],
      [
        m("A", "C", SWEEP),
        m("A", "D", SWEEP), // A: 2-0, 2-0 → SL 0
        m("B", "C", [
          [25, 20],
          [20, 25],
          [15, 10],
        ]),
        m("B", "D", [
          [25, 20],
          [20, 25],
          [15, 10],
        ]), // B drops sets
      ],
    );
    // A,B tied at 2 wins, never played → h2h 0/0, then set ratio: A=∞ > B.
    expect(rows[0].teamId).toBe("A");
    expect(rows[1].teamId).toBe("B");
    expect(rows[0].tiebreakerStep).toBe(3);
    expect(rows[0].setRatio).toBe(Infinity);
  });
});

describe("rankStandings — step 4 (point ratio)", () => {
  it("breaks a tie equal through set ratio by point ratio", () => {
    const rows = rankStandings(
      ["A", "B"],
      [
        m("A", "B", [
          [25, 20],
          [25, 20],
        ]), // A 2–0, +10
        m("B", "A", [
          [25, 23],
          [25, 23],
        ]), // B 2–0, +4
      ],
    );
    // Both 1 win, set ratio 1.0; A point ratio 96/90 > B 90/96.
    expect(rows.map((r) => r.teamId)).toEqual(["A", "B"]);
    expect(rows.every((r) => r.tiebreakerStep === 4)).toBe(true);
  });
});

describe("rankStandings — step 5 (unresolved)", () => {
  it("marks fully-equal teams TBD in stable input order", () => {
    const rows = rankStandings(
      ["A", "B"],
      [
        m("A", "B", [
          [25, 20],
          [25, 20],
        ]),
        m("B", "A", [
          [25, 20],
          [25, 20],
        ]),
      ],
    );
    expect(rows.map((r) => r.teamId)).toEqual(["A", "B"]);
    expect(rows.every((r) => r.tiebreakerStep === 5)).toBe(true);
    expect(rows[0].explanation).toMatch(/TBD/);
  });
});

describe("rankStandings — mixed steps (3-way partial)", () => {
  it("separates top by head-to-head, rest by point ratio", () => {
    const rows = rankStandings(
      ["A", "B", "C", "D", "E"],
      [
        m("A", "B", [
          [25, 5],
          [25, 5],
        ]),
        m("A", "C", [
          [25, 5],
          [25, 5],
        ]),
        m("B", "D", [
          [25, 10],
          [25, 10],
        ]),
        m("B", "E", [
          [25, 10],
          [25, 10],
        ]),
        m("C", "D", [
          [25, 15],
          [25, 15],
        ]),
        m("C", "E", [
          [25, 15],
          [25, 15],
        ]),
      ],
    );
    // A,B,C tied at 2 wins. h2h: A beat B & C → A first (step 2). B,C tied on
    // set ratio (4/2 each) → point ratio: B (110/90) > C (110/110).
    expect(rows[0]).toMatchObject({ teamId: "A", tiebreakerStep: 2 });
    expect(rows[1]).toMatchObject({ teamId: "B", tiebreakerStep: 4 });
    expect(rows[2]).toMatchObject({ teamId: "C", tiebreakerStep: 4 });
  });
});

describe("rankStandings — forfeits", () => {
  it("awards the match win to the opponent of the forfeiting team", () => {
    const rows = rankStandings(["A", "B"], [m("A", "B", [], "A")]);
    expect(rows[0].teamId).toBe("B");
    expect(rows[0].mw).toBe(1);
    expect(rows[1].teamId).toBe("A");
    expect(rows[1].ml).toBe(1);
    // No sets recorded → set/point ratios stay at 0.
    expect(rows[0].setRatio).toBe(0);
  });
});

describe("rankStandings — tiedWith (powers the explainer modal)", () => {
  it("is just the team itself when resolved outright on match wins", () => {
    const rows = rankStandings(
      ["A", "B", "C"],
      [m("A", "B", SWEEP), m("A", "C", SWEEP), m("B", "C", SWEEP)],
    );
    // All distinct match-win counts → no real tie for anyone.
    expect(rows.every((r) => r.tiedWith.length === 1)).toBe(true);
    expect(rows[0].tiedWith).toEqual(["A"]);
  });

  it("captures the full tied group at the resolving step", () => {
    // A,B tied at 2 wins, split by head-to-head; C,D unique.
    const rows = rankStandings(
      ["A", "B", "C", "D"],
      [
        m("A", "B", SWEEP),
        m("A", "C", SWEEP),
        m("D", "A", SWEEP),
        m("B", "C", SWEEP),
        m("B", "D", SWEEP),
      ],
    );
    const byId = new Map(rows.map((r) => [r.teamId, r]));
    // A and B were the tied subset resolved at head-to-head.
    expect([...byId.get("A")!.tiedWith].sort()).toEqual(["A", "B"]);
    expect([...byId.get("B")!.tiedWith].sort()).toEqual(["A", "B"]);
    // D resolved outright (unique win count) → only itself.
    expect(byId.get("D")!.tiedWith).toEqual(["D"]);
  });

  it("a fully-equal field is all mutually tied (step 5)", () => {
    const rows = rankStandings(
      ["A", "B"],
      [
        m("A", "B", [
          [25, 20],
          [25, 20],
        ]),
        m("B", "A", [
          [25, 20],
          [25, 20],
        ]),
      ],
    );
    expect([...rows[0].tiedWith].sort()).toEqual(["A", "B"]);
  });
});

describe("headToHeadTable — known-good OVA fixture", () => {
  it("reproduces the OVA modal numbers for a 4-team pool", () => {
    const teams = ["T1", "T2", "T3", "T4"];
    const matches = [
      m("T1", "T2", SWEEP),
      m("T1", "T3", SWEEP),
      m("T1", "T4", SWEEP),
      m("T2", "T3", SWEEP),
      m("T2", "T4", SWEEP),
      m("T3", "T4", SWEEP),
    ];
    const table = headToHeadTable(teams, matches);
    expect(table).toEqual([
      { teamId: "T1", wins: 3, played: 3, ratio: 1 },
      { teamId: "T2", wins: 2, played: 3, ratio: 2 / 3 },
      { teamId: "T3", wins: 1, played: 3, ratio: 1 / 3 },
      { teamId: "T4", wins: 0, played: 3, ratio: 0 },
    ]);
    // Exact float formatting matches the OVA display strings.
    expect(String(table[1].ratio)).toBe("0.6666666666666666");
    expect(String(table[2].ratio)).toBe("0.3333333333333333");

    const standings = rankStandings(teams, matches);
    expect(standings.map((r) => r.teamId)).toEqual(["T1", "T2", "T3", "T4"]);
    expect(standings.every((r) => r.tiebreakerStep === 1)).toBe(true);
  });
});
