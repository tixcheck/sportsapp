import { describe, expect, it } from "vitest";

import {
  generateReversePairs,
  reversePairsProblem,
  suggestRounds,
  type ReversePairsGame,
} from "@/lib/scheduler/reverse-pairs";

const pairs = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

/** Unordered key so {a,b} and {b,a} collide. */
const k = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function partnerships(games: ReversePairsGame[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of games) {
    for (const team of [g.teamA, g.teamB]) {
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          const key = k(team[i], team[j]);
          out.set(key, (out.get(key) ?? 0) + 1);
        }
      }
    }
  }
  return out;
}

describe("reversePairsProblem", () => {
  it("needs enough pairs to fill the courts", () => {
    expect(reversePairsProblem(12, 2, 8)).toBeNull();
    expect(reversePairsProblem(15, 2, 10)).toBeNull();
    expect(reversePairsProblem(11, 2, 8)).toMatch(/needs 12 pairs on court/);
    expect(reversePairsProblem(6, 1, 8)).toBeNull();
  });

  it("rejects nonsense courts and rounds", () => {
    expect(reversePairsProblem(18, 0, 8)).toMatch(/at least one court/);
    expect(reversePairsProblem(18, 2, 0)).toMatch(/at least one game/);
    expect(reversePairsProblem(18, 2, 1.5)).toMatch(/at least one game/);
  });

  /** More pairs than court space is the normal case, not an error. */
  it("accepts a field bigger than the courts can hold", () => {
    expect(reversePairsProblem(15, 2, 10)).toBeNull();
    expect(reversePairsProblem(16, 2, 8)).toBeNull();
    expect(reversePairsProblem(18, 2, 12)).toBeNull();
  });
});

describe("suggestRounds", () => {
  /**
   * With more pairs than court space the byes only divide evenly at certain
   * round counts. These are the organizer's real fields.
   */
  it("finds the round counts where everyone plays equally", () => {
    expect(suggestRounds(15, 2, { min: 1, max: 12 })).toEqual([
      { rounds: 5, gamesPerPair: 4 },
      { rounds: 10, gamesPerPair: 8 },
    ]);
    expect(suggestRounds(16, 2, { min: 1, max: 12 })).toEqual([
      { rounds: 4, gamesPerPair: 3 },
      { rounds: 8, gamesPerPair: 6 },
      { rounds: 12, gamesPerPair: 9 },
    ]);
    // His 18-pair night: two courts, twelve rounds, eight games each.
    expect(suggestRounds(18, 2, { min: 1, max: 12 })).toEqual([
      { rounds: 3, gamesPerPair: 2 },
      { rounds: 6, gamesPerPair: 4 },
      { rounds: 9, gamesPerPair: 6 },
      { rounds: 12, gamesPerPair: 8 },
    ]);
  });

  it("says every round works when the field exactly fills the courts", () => {
    const all = suggestRounds(18, 3, { min: 1, max: 5 });
    expect(all).toEqual([
      { rounds: 1, gamesPerPair: 1 },
      { rounds: 2, gamesPerPair: 2 },
      { rounds: 3, gamesPerPair: 3 },
      { rounds: 4, gamesPerPair: 4 },
      { rounds: 5, gamesPerPair: 5 },
    ]);
  });

  it("returns nothing when the field cannot fill the courts", () => {
    expect(suggestRounds(10, 2)).toEqual([]);
  });
});

describe("generateReversePairs", () => {
  it("fills every court in every round and benches the rest", () => {
    const { games, byes } = generateReversePairs({
      pairIds: pairs(15),
      courts: 2,
      rounds: 10,
      seed: 3,
    });

    expect(games).toHaveLength(20); // 10 rounds x 2 courts
    expect(byes).toHaveLength(10);

    for (let g = 1; g <= 10; g++) {
      const round = games.filter((m) => m.game === g);
      expect(round.map((m) => m.court)).toEqual([1, 2]);

      const onCourt = round.flatMap((m) => [...m.teamA, ...m.teamB]);
      expect(onCourt).toHaveLength(12);
      // Nobody plays twice in a round — the double-booking that creeps into a
      // hand-drawn sheet.
      expect(new Set(onCourt).size).toBe(12);

      // The bench is exactly everyone else.
      expect(byes[g - 1]).toHaveLength(3);
      expect([...onCourt, ...byes[g - 1]].sort()).toEqual(pairs(15).sort());
    }
  });

  it("gives everyone the same number of games at a suggested round count", () => {
    for (const [n, courts, rounds] of [
      [15, 2, 10],
      [16, 2, 8],
      [18, 2, 12],
    ] as const) {
      const { quality } = generateReversePairs({
        pairIds: pairs(n),
        courts,
        rounds,
        seed: 4,
      });
      expect(quality.evenGames).toBe(true);
      expect(quality.minGames).toBe((courts * 6 * rounds) / n);
    }
  });

  it("keeps games within one when the round count doesn't divide evenly", () => {
    // 6 rounds of 16 pairs is 72 slots over 16 pairs — 4.5 each, so some play 4
    // and some 5. Nobody may be further out than that.
    const { quality } = generateReversePairs({
      pairIds: pairs(16),
      courts: 2,
      rounds: 6,
      seed: 4,
    });
    expect(quality.evenGames).toBe(false);
    expect(quality.maxGames - quality.minGames).toBe(1);
  });

  /**
   * The benchmarks are the organizer's own hand-drawn nights.
   *
   * 15 pairs over 10 rounds: 120 partnership slots against 105 possible pairs,
   * so at least 15 must repeat. His sheet had 32. Hitting 15 means every pair
   * meets all 14 others, which is the best the format allows.
   */
  it("reaches the theoretical floor on the 15-pair night", () => {
    const { quality } = generateReversePairs({
      pairIds: pairs(15),
      courts: 2,
      rounds: 10,
      seed: 7,
    });

    expect(quality.evenGames).toBe(true);
    expect(quality.repeatPartnerships).toBeLessThanOrEqual(18); // floor is 15
    expect(quality.minPartners).toBeGreaterThanOrEqual(13);
    expect(quality.distinctPartnerships).toBeGreaterThanOrEqual(100);
  });

  it("draws a perfect night where one exists", () => {
    // 16 pairs, 2 courts, 8 rounds: 96 slots against 120 possible pairs, and
    // enough room to use each at most once.
    const clean = generateReversePairs({
      pairIds: pairs(16),
      courts: 2,
      rounds: 8,
      seed: 7,
    });
    expect(clean.quality.repeatPartnerships).toBe(0);
    expect(clean.quality.evenGames).toBe(true);
    expect(clean.quality.minPartners).toBe(12);

    // 15 pairs over 5 rounds — the shorter even option.
    const short = generateReversePairs({
      pairIds: pairs(15),
      courts: 2,
      rounds: 5,
      seed: 7,
    });
    expect(short.quality.repeatPartnerships).toBe(0);
    expect(short.quality.evenGames).toBe(true);
  });

  it("reports quality that matches the schedule it returns", () => {
    const { games, quality } = generateReversePairs({
      pairIds: pairs(16),
      courts: 2,
      rounds: 6,
      seed: 5,
    });
    const counts = partnerships(games);

    expect(quality.distinctPartnerships).toBe(counts.size);
    let repeats = 0;
    for (const v of counts.values()) repeats += v > 1 ? v - 1 : 0;
    expect(quality.repeatPartnerships).toBe(repeats);
  });

  it("is deterministic for a seed, and varies between seeds", () => {
    const a = generateReversePairs({
      pairIds: pairs(15),
      courts: 2,
      rounds: 5,
      seed: 42,
    });
    const b = generateReversePairs({
      pairIds: pairs(15),
      courts: 2,
      rounds: 5,
      seed: 42,
    });
    const c = generateReversePairs({
      pairIds: pairs(15),
      courts: 2,
      rounds: 5,
      seed: 43,
    });

    expect(a.games).toEqual(b.games);
    expect(a.games).not.toEqual(c.games);
  });

  it("uses the ids it was given", () => {
    const ids = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
    const { games, byes } = generateReversePairs({
      pairIds: ids,
      courts: 1,
      rounds: 2,
      seed: 1,
    });

    expect(games).toHaveLength(2);
    for (const m of games) {
      expect([...m.teamA, ...m.teamB].sort()).toEqual([...ids].sort());
    }
    expect(byes).toEqual([[], []]); // one court exactly fits six pairs
  });

  it("refuses a field that cannot fill its courts", () => {
    expect(() =>
      generateReversePairs({ pairIds: pairs(10), courts: 2, rounds: 8 }),
    ).toThrow(/needs 12 pairs on court/);
    expect(() =>
      generateReversePairs({ pairIds: pairs(18), courts: 2, rounds: 0 }),
    ).toThrow(/at least one game/);
  });

  it("spreads opponents without sacrificing partners", () => {
    const { games, quality } = generateReversePairs({
      pairIds: pairs(16),
      courts: 2,
      rounds: 8,
      seed: 9,
    });

    const faced = new Map<string, number>();
    for (const m of games) {
      for (const x of m.teamA) {
        for (const y of m.teamB) {
          const key = k(x, y);
          faced.set(key, (faced.get(key) ?? 0) + 1);
        }
      }
    }
    // Partners stay perfect — opponent balancing is the junior objective and
    // must never cost a partnership.
    expect(quality.repeatPartnerships).toBe(0);

    const per = new Map<string, number>();
    for (const key of faced.keys()) {
      for (const id of key.split("|")) per.set(id, (per.get(id) ?? 0) + 1);
    }
    expect(Math.min(...per.values())).toBeGreaterThanOrEqual(9);
  });
});
