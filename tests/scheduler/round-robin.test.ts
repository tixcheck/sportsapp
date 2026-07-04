import { describe, expect, it } from "vitest";

import {
  generatePairings,
  generateRoundRobin,
  type PairingRound,
} from "@/lib/scheduler/round-robin";

function teams(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `T${i + 1}`);
}

function unorderedKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function allPairs(rounds: PairingRound[]): string[] {
  return rounds.flatMap((r) =>
    r.pairs.map((p) => unorderedKey(p.homeTeamId, p.awayTeamId)),
  );
}

describe("generatePairings — coverage & structure", () => {
  it("4 teams: 3 rounds, every pair exactly once", () => {
    const rounds = generatePairings(teams(4));
    expect(rounds).toHaveLength(3);
    rounds.forEach((r) => expect(r.pairs).toHaveLength(2));
    const pairs = allPairs(rounds);
    expect(pairs).toHaveLength(6); // C(4,2)
    expect(new Set(pairs).size).toBe(6);
  });

  it("8 teams: 7 rounds, 28 matches, each pair once", () => {
    const rounds = generatePairings(teams(8));
    expect(rounds).toHaveLength(7);
    const pairs = allPairs(rounds);
    expect(pairs).toHaveLength(28);
    expect(new Set(pairs).size).toBe(28);
  });

  it("no team plays twice in the same round", () => {
    const rounds = generatePairings(teams(8));
    for (const r of rounds) {
      const seen = new Set<string>();
      for (const p of r.pairs) {
        expect(seen.has(p.homeTeamId)).toBe(false);
        expect(seen.has(p.awayTeamId)).toBe(false);
        seen.add(p.homeTeamId);
        seen.add(p.awayTeamId);
      }
    }
  });

  it("odd team count gives each team exactly one bye", () => {
    const rounds = generatePairings(teams(5));
    expect(rounds).toHaveLength(5); // n=6 incl bye → 5 rounds
    rounds.forEach((r) => expect(r.pairs).toHaveLength(2));
    const byes = rounds.map((r) => r.byeTeamId);
    expect(byes.every((b) => b !== null)).toBe(true);
    expect(new Set(byes).size).toBe(5); // each team byes once
  });

  it("2 teams: a single round, single match", () => {
    const rounds = generatePairings(teams(2));
    expect(rounds).toHaveLength(1);
    expect(rounds[0].pairs).toHaveLength(1);
  });

  it("fewer than 2 teams produces no rounds", () => {
    expect(generatePairings(teams(1))).toEqual([]);
    expect(generatePairings([])).toEqual([]);
  });

  it("roundsPerTeam=2: every pair meets exactly twice", () => {
    const rounds = generatePairings(teams(4), 2);
    expect(rounds).toHaveLength(6); // 2 × 3
    const counts = new Map<string, number>();
    for (const k of allPairs(rounds)) counts.set(k, (counts.get(k) ?? 0) + 1);
    expect([...counts.values()].every((c) => c === 2)).toBe(true);
    expect(counts.size).toBe(6);
  });

  it("2× schedule reverses home/away (each team hosts each opponent once)", () => {
    const rounds = generatePairings(teams(4), 2);
    const ordered = rounds.flatMap((r) =>
      r.pairs.map((p) => `${p.homeTeamId}>${p.awayTeamId}`),
    );
    // For every directed pairing, the reverse also appears.
    for (const dir of ordered) {
      const [h, a] = dir.split(">");
      expect(ordered).toContain(`${a}>${h}`);
    }
  });

  it("is deterministic", () => {
    expect(generatePairings(teams(6))).toEqual(generatePairings(teams(6)));
  });
});

describe("generatePairings — partial round robin (gamesPerTeam)", () => {
  /** opponents[team] = the list of opponents that team faced. */
  function opponentsByTeam(rounds: PairingRound[]): Map<string, string[]> {
    const opp = new Map<string, string[]>();
    const add = (a: string, b: string) => {
      const list = opp.get(a) ?? [];
      list.push(b);
      opp.set(a, list);
    };
    for (const r of rounds) {
      for (const p of r.pairs) {
        add(p.homeTeamId, p.awayTeamId);
        add(p.awayTeamId, p.homeTeamId);
      }
    }
    return opp;
  }

  it("12 teams, 6 games each: 6 rounds, distinct opponents, no repeats", () => {
    const rounds = generatePairings(teams(12), 1, 6);
    expect(rounds).toHaveLength(6);
    rounds.forEach((r) => expect(r.pairs).toHaveLength(6)); // 12/2 per round

    const opp = opponentsByTeam(rounds);
    expect(opp.size).toBe(12);
    for (const list of opp.values()) {
      expect(list).toHaveLength(6); // exactly 6 games
      expect(new Set(list).size).toBe(6); // all different opponents
    }
  });

  it("is the prefix of the full schedule (first N rounds)", () => {
    const full = generatePairings(teams(12), 1);
    const partial = generatePairings(teams(12), 1, 6);
    expect(partial).toEqual(full.slice(0, 6));
  });

  it("a cap ≥ the full round robin plays the whole schedule", () => {
    const full = generatePairings(teams(8), 1);
    expect(generatePairings(teams(8), 1, 99)).toEqual(full); // full = 7 rounds
    expect(generatePairings(teams(8), 1, 7)).toEqual(full);
  });

  it("null/omitted cap plays the full round robin", () => {
    const full = generatePairings(teams(6), 1);
    expect(generatePairings(teams(6), 1, null)).toEqual(full);
    expect(generatePairings(teams(6), 1, undefined)).toEqual(full);
  });

  it("generateRoundRobin honors the games-per-team cap", () => {
    const { rounds } = generateRoundRobin({
      teamIds: teams(12),
      courts: 3,
      startDate: "2026-01-06",
      gamesPerTeam: 6,
    });
    expect(rounds).toHaveLength(6);
    // 6 matches per round across 3 courts (two per court, i.e. two waves).
    rounds.forEach((r) => expect(r.matches).toHaveLength(6));
  });
});

describe("generateRoundRobin — calendar & courts", () => {
  it("lays rounds onto a weekly cadence from startDate", () => {
    const { rounds } = generateRoundRobin({
      teamIds: teams(4),
      courts: 2,
      startDate: "2026-01-06", // a Tuesday
    });
    expect(rounds.map((r) => r.date)).toEqual([
      "2026-01-06",
      "2026-01-13",
      "2026-01-20",
    ]);
  });

  it("skips blackout dates", () => {
    const { rounds } = generateRoundRobin({
      teamIds: teams(4),
      courts: 2,
      startDate: "2026-01-06",
      blackoutDates: ["2026-01-13"],
    });
    expect(rounds.map((r) => r.date)).toEqual([
      "2026-01-06",
      "2026-01-20", // 01-13 skipped
      "2026-01-27",
    ]);
  });

  it("assigns courts within range and rotates them across rounds", () => {
    const { rounds } = generateRoundRobin({
      teamIds: teams(4),
      courts: 2,
      startDate: "2026-01-06",
    });
    const courtsByTeam = new Map<string, Set<number>>();
    for (const r of rounds) {
      const used = r.matches.map((mt) => mt.court);
      used.forEach((c) => expect(c >= 1 && c <= 2).toBe(true));
      expect(new Set(used).size).toBe(used.length); // unique per round
      for (const mt of r.matches) {
        for (const t of [mt.homeTeamId, mt.awayTeamId]) {
          if (!courtsByTeam.has(t)) courtsByTeam.set(t, new Set());
          courtsByTeam.get(t)!.add(mt.court);
        }
      }
    }
    // No team is stuck on a single court.
    expect([...courtsByTeam.values()].some((s) => s.size > 1)).toBe(true);
  });

  it("rejects an invalid court count", () => {
    expect(() =>
      generateRoundRobin({
        teamIds: teams(4),
        courts: 0,
        startDate: "2026-01-06",
      }),
    ).toThrow();
  });

  it("records byes on the scheduled round for odd counts", () => {
    const { rounds } = generateRoundRobin({
      teamIds: teams(5),
      courts: 3,
      startDate: "2026-01-06",
    });
    expect(rounds).toHaveLength(5);
    expect(rounds.every((r) => r.byeTeamId !== null)).toBe(true);
  });
});
