import { describe, expect, it } from "vitest";

import {
  consolationPairs,
  courtPriority,
  leaguePlayoffProblem,
  planLeaguePlayoff,
  playoffGameLabel,
  playoffSlotSource,
  type PlayoffGame,
  type TeamSource,
} from "@/lib/scheduler/league-playoff";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => `S${i + 1}`);

/** "#1", "W(r1p2)", "L(r2p1)" — a game's teams as a sheet would read them. */
function src(s: TeamSource): string {
  if (s.kind === "seed") return `#${s.seed}`;
  return `${s.kind === "winner" ? "W" : "L"}(r${s.round}p${s.position})`;
}

const render = (g: PlayoffGame) => `${src(g.home)} v ${src(g.away)}`;

const pick = (games: PlayoffGame[], night: number, wave: number) =>
  games.filter((g) => g.night === night && g.wave === wave);

describe("leaguePlayoffProblem", () => {
  it("accepts the Top Gun field", () => {
    expect(leaguePlayoffProblem(14, 8)).toBeNull();
  });

  it("refuses a bracket that would need byes", () => {
    expect(leaguePlayoffProblem(14, 12)).toMatch(/clean bracket/);
    expect(leaguePlayoffProblem(20, 10)).toMatch(/clean bracket/);
  });

  /**
   * Below eight the beaten first-round teams ARE the bronze game, so a
   * separate losers' game would schedule the same fixture twice.
   */
  it("refuses a bracket too small for the format", () => {
    expect(leaguePlayoffProblem(10, 4)).toMatch(/at least 8/i);
  });

  it("refuses a consolation field it can't pair", () => {
    expect(leaguePlayoffProblem(9, 8)).toMatch(/nobody to play/);
    expect(leaguePlayoffProblem(13, 8)).toMatch(/odd number/);
    expect(leaguePlayoffProblem(6, 8)).toMatch(/not enough/);
  });
});

describe("consolationPairs", () => {
  /** The pairings the organizer was shown for Top Gun's bottom six. */
  it("produces the agreed Top Gun consolation", () => {
    const rounds = consolationPairs(6);
    const asSeeds = rounds.map((r) => r.map(([a, b]) => `${a + 9}v${b + 9}`));

    expect(asSeeds).toEqual([
      ["9v14", "10v13", "11v12"],
      ["9v12", "10v11", "13v14"],
    ]);
  });

  it("gives everyone two games and nobody the same opponent twice", () => {
    for (const n of [4, 6, 8, 10, 12, 14, 16, 20]) {
      const rounds = consolationPairs(n);
      const all = rounds.flat();

      expect(rounds).toHaveLength(2);
      expect(all).toHaveLength(n); // n/2 games x 2 rounds

      // Nobody plays themselves.
      expect(all.every(([a, b]) => a !== b)).toBe(true);

      // Every team exactly twice.
      for (let i = 0; i < n; i++) {
        expect(all.filter((p) => p.includes(i))).toHaveLength(2);
      }

      // Every pairing distinct.
      const edges = all.map(([a, b]) => [a, b].sort((x, y) => x - y).join("-"));
      expect(new Set(edges).size).toBe(edges.length);
    }
  });

  it("returns nothing for a field it can't pair", () => {
    expect(consolationPairs(5)).toEqual([]);
    expect(consolationPairs(2)).toEqual([]);
    expect(consolationPairs(0)).toEqual([]);
  });
});

describe("planLeaguePlayoff", () => {
  const plan = planLeaguePlayoff({ seeds: seeds(14), topCount: 8 });

  /**
   * The organizer's own words: 1v8, 2v7, 3v6, 4v5, then winners play winners
   * and losers play losers so everyone gets two games that evening; the
   * following week is just a final and a bronze game.
   */
  it("opens with the quarter-finals the organizer specified", () => {
    const qf = pick(plan.games, 1, 0).filter((g) => g.track === "championship");
    // Bracket order, so seeds 1 and 2 can only meet in the final.
    expect(qf.map(render)).toEqual([
      "#1 v #8",
      "#4 v #5",
      "#2 v #7",
      "#3 v #6",
    ]);
  });

  it("pairs winners with winners and losers with losers in wave two", () => {
    const wave2 = pick(plan.games, 1, 1);

    expect(wave2.filter((g) => g.track === "championship").map(render)).toEqual(
      ["W(r1p1) v W(r1p2)", "W(r1p3) v W(r1p4)"],
    );

    expect(
      wave2.filter((g) => g.track === "placement" && g.round === 1).map(render),
    ).toEqual(["L(r1p1) v L(r1p2)", "L(r1p3) v L(r1p4)"]);
  });

  it("gives every team two games on the first night", () => {
    const night1 = plan.games.filter((g) => g.night === 1);

    // The eight bracket teams each appear once in wave 1 and, whether they win
    // or lose, exactly once in wave 2 — that is the promise of the format.
    const bracketSeeds = pick(night1, 1, 0)
      .filter((g) => g.track === "championship")
      .flatMap((g) => [g.home, g.away])
      .map((s) => (s.kind === "seed" ? s.seed : null));
    expect(bracketSeeds.sort((a, b) => a! - b!)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);

    // Wave 2 has a slot for all eight: four winners, four losers.
    const wave2Slots = pick(night1, 1, 1).filter(
      (g) => g.track === "championship" || g.round === 1,
    );
    expect(wave2Slots).toHaveLength(4); // 2 semis + 2 losers' games

    // And the consolation six play once in each wave.
    for (let seed = 9; seed <= 14; seed++) {
      const appearances = night1
        .filter((g) => g.label === "Consolation")
        .filter((g) =>
          [g.home, g.away].some((s) => s.kind === "seed" && s.seed === seed),
        );
      expect(appearances).toHaveLength(2);
      expect(new Set(appearances.map((g) => g.wave)).size).toBe(2);
    }

    expect(plan.guaranteedGames).toBe(2);
  });

  it("fits the night on seven courts, twice over", () => {
    expect(pick(plan.games, 1, 0)).toHaveLength(7);
    expect(pick(plan.games, 1, 1)).toHaveLength(7);
    expect(plan.games).toHaveLength(16);
  });

  it("leaves only the final and the bronze game for night two", () => {
    const night2 = plan.games.filter((g) => g.night === 2);
    expect(night2).toHaveLength(2);
    expect(night2.map((g) => g.label).sort()).toEqual(["Bronze", "Final"]);
    expect(night2.map(render)).toEqual([
      "W(r2p1) v W(r2p2)",
      "L(r2p1) v L(r2p2)",
    ]);
  });

  it("splits the field into the top eight and the rest", () => {
    expect(plan.top).toEqual(seeds(14).slice(0, 8));
    expect(plan.bottom).toEqual(seeds(14).slice(8));
  });

  it("never schedules a final in the same wave as the semi feeding it", () => {
    // A sixteen-team bracket needs two waves on night two.
    const big = planLeaguePlayoff({ seeds: seeds(24), topCount: 16 });
    const semis = big.games.find((g) => g.label === "Semi-final")!;
    const final = big.games.find((g) => g.label === "Final")!;
    expect(final.night).toBe(semis.night);
    expect(final.wave).toBeGreaterThan(semis.wave);

    const bronze = big.games.find((g) => g.label === "Bronze")!;
    expect(bronze.wave).toBe(final.wave);
  });

  it("gives every game a unique slot in its track", () => {
    const keys = plan.games.map((g) => `${g.track}:${g.round}:${g.position}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("refuses a field it can't lay out", () => {
    expect(() => planLeaguePlayoff({ seeds: seeds(13), topCount: 8 })).toThrow(
      /odd number/,
    );
  });
});

describe("playoffGameLabel", () => {
  it("names the championship rounds from the tree's depth", () => {
    // Numbered, so "Winner of QF2" on a later game has something to point at.
    expect(playoffGameLabel("championship", 1, 1, 3)).toBe("Quarter-final 1");
    expect(playoffGameLabel("championship", 1, 4, 3)).toBe("Quarter-final 4");
    expect(playoffGameLabel("championship", 2, 1, 3)).toBe("Semi-final 1");
    expect(playoffGameLabel("championship", 2, 2, 3)).toBe("Semi-final 2");
    expect(playoffGameLabel("championship", 3, 1, 3)).toBe("Final");
    expect(playoffGameLabel("championship", 3, 2, 3)).toBe("Bronze");
  });

  it("names the beaten quarter-finalists' game by the places it decides", () => {
    expect(playoffGameLabel("placement", 1, 1, 3)).toBe("5th–8th");
    // A sixteen-team bracket: its first-round losers play for 9th to 16th.
    expect(playoffGameLabel("placement", 1, 1, 4)).toBe("9th–16th");
  });

  it("calls the rest consolation", () => {
    expect(playoffGameLabel("placement", 2, 1, 3)).toBe("Consolation");
    expect(playoffGameLabel("placement", 3, 3, 3)).toBe("Consolation");
  });
});

describe("playoffSlotSource", () => {
  /**
   * A blank slot on a schedule reads as a mistake. Until the quarter-final is
   * played, "Loser of QF1" IS the fixture.
   */
  it("says where an undecided team comes from", () => {
    expect(playoffSlotSource("championship", 2, 1, 3)).toEqual({
      home: "Winner of QF1",
      away: "Winner of QF2",
    });
    expect(playoffSlotSource("championship", 3, 1, 3)).toEqual({
      home: "Winner of SF1",
      away: "Winner of SF2",
    });
    expect(playoffSlotSource("placement", 1, 2, 3)).toEqual({
      home: "Loser of QF3",
      away: "Loser of QF4",
    });
  });

  it("routes the bronze game from the beaten semi-finalists", () => {
    // Not the winners of the round below — the exception in the whole tree.
    expect(playoffSlotSource("championship", 3, 2, 3)).toEqual({
      home: "Loser of SF1",
      away: "Loser of SF2",
    });
  });

  it("has nothing to say about games whose teams are already known", () => {
    expect(playoffSlotSource("championship", 1, 1, 3)).toBeNull();
    expect(playoffSlotSource("placement", 2, 1, 3)).toBeNull();
  });
});

describe("courtPriority", () => {
  const plan = planLeaguePlayoff({ seeds: seeds(14), topCount: 8 });
  const seedOf = (s: TeamSource) => (s.kind === "seed" ? s.seed : null);
  const order = (night: number, wave: number) =>
    pick(plan.games, night, wave)
      .slice()
      .sort((a, b) => {
        const [ta, sa] = courtPriority(a, seedOf);
        const [tb, sb] = courtPriority(b, seedOf);
        return ta - tb || sa - sb || a.position - b.position;
      });

  /**
   * The organizer's rule: the top two seeds always play on prime courts. Courts
   * are handed out in this order, so those two games have to come first.
   */
  it("puts the top two seeds' games first in the opening wave", () => {
    const first = order(1, 0);
    expect(first.slice(0, 2).map(render)).toEqual(["#1 v #8", "#2 v #7"]);
    // Then the rest of the bracket, then the consolation field.
    expect(first.map(render)).toEqual([
      "#1 v #8",
      "#2 v #7",
      "#3 v #6",
      "#4 v #5",
      "#9 v #14",
      "#10 v #13",
      "#11 v #12",
    ]);
  });

  it("ranks a semi-final above a consolation game with known teams", () => {
    // The semi's teams aren't decided yet; it still deserves the better floor.
    const second = order(1, 1);
    expect(second.slice(0, 2).every((g) => g.label === "Semi-final")).toBe(
      true,
    );
    expect(second.slice(2, 4).every((g) => g.track === "placement")).toBe(true);
    expect(second.slice(4).every((g) => g.label === "Consolation")).toBe(true);
  });

  it("gives the final the best court of all", () => {
    expect(order(2, 0)[0].label).toBe("Final");
  });
});
