import { describe, expect, it } from "vitest";

import { assignCourts, type Court } from "@/lib/scheduler/court-assign";
import {
  generatePairings,
  type PairingRound,
} from "@/lib/scheduler/round-robin";

function teams(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `T${i + 1}`);
}

function courts(labels: string[], prime: string[]): Court[] {
  const p = new Set(prime);
  return labels.map((label) => ({ label, prime: p.has(label) }));
}

/** Prime games played by each team across the whole schedule. */
function primePerTeam(
  pairings: PairingRound[],
  assigned: { courts: string[] }[],
  primeLabels: string[],
): Map<string, number> {
  const prime = new Set(primeLabels);
  const out = new Map<string, number>();
  pairings.forEach((r, ri) => {
    r.pairs.forEach((p, pi) => {
      if (prime.has(assigned[ri].courts[pi])) {
        for (const id of [p.homeTeamId, p.awayTeamId]) {
          out.set(id, (out.get(id) ?? 0) + 1);
        }
      }
    });
  });
  return out;
}

describe("assignCourts", () => {
  it("gives each match a distinct court from the list every round", () => {
    const pairings = generatePairings(teams(8), 1); // 7 rounds, 4 matches each
    const cts = courts(["9", "10", "11", "12"], ["9", "10"]);
    const assigned = assignCourts(pairings, cts);
    const valid = new Set(["9", "10", "11", "12"]);
    assigned.forEach((rc, i) => {
      expect(rc.courts).toHaveLength(pairings[i].pairs.length);
      expect(new Set(rc.courts).size).toBe(rc.courts.length); // no collision
      rc.courts.forEach((c) => expect(valid.has(c)).toBe(true));
    });
  });

  it("balances prime-court games evenly across teams", () => {
    const pairings = generatePairings(teams(8), 1);
    const cts = courts(["9", "10", "11", "12"], ["9", "10"]);
    const assigned = assignCourts(pairings, cts);
    const per = primePerTeam(pairings, assigned, ["9", "10"]);
    const counts = teams(8).map((t) => per.get(t) ?? 0);
    // 7 rounds × 2 prime matches × 2 teams = 28 prime slots / 8 teams ≈ 3.5.
    expect(counts.reduce((a, b) => a + b, 0)).toBe(28);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("stays balanced with an odd team count (byes)", () => {
    const pairings = generatePairings(teams(9), 1); // 9 rounds, one bye/round
    const cts = courts(["A", "B", "C", "D"], ["A"]);
    const assigned = assignCourts(pairings, cts);
    const per = primePerTeam(pairings, assigned, ["A"]);
    const counts = teams(9).map((t) => per.get(t) ?? 0);
    // One scarce prime court + rotating byes → within 2 of each other (still fair).
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
  });

  it("puts every game on a prime court when all courts are prime", () => {
    const pairings = generatePairings(teams(6), 1); // 5 games each
    const cts = courts(["1", "2", "3"], ["1", "2", "3"]);
    const assigned = assignCourts(pairings, cts);
    const per = primePerTeam(pairings, assigned, ["1", "2", "3"]);
    for (const t of teams(6)) expect(per.get(t)).toBe(5);
  });

  it("assigns valid distinct courts when none are prime", () => {
    const pairings = generatePairings(teams(6), 1);
    const cts = courts(["1", "2", "3"], []);
    const assigned = assignCourts(pairings, cts);
    const valid = new Set(["1", "2", "3"]);
    assigned.forEach((rc) => {
      expect(new Set(rc.courts).size).toBe(rc.courts.length);
      rc.courts.forEach((c) => expect(valid.has(c)).toBe(true));
    });
    expect(primePerTeam(pairings, assigned, []).size).toBe(0);
  });

  it("seeds the prime ledger so a mid-season continuation stays balanced", () => {
    // T1 already banked 3 prime games (from played weeks); everyone else 0.
    // The new games should steer prime courts AWAY from T1 to even it out.
    const pairings = generatePairings(teams(4), 1); // 3 rounds, 2 games each
    const cts = courts(["P", "N"], ["P"]); // one prime, one not
    const seed = new Map<string, number>([["T1", 3]]);

    const assigned = assignCourts(pairings, cts, seed);
    const fresh = primePerTeam(pairings, assigned, ["P"]);
    // Over 3 rounds T1 should get few/no new prime games while others catch up.
    expect(fresh.get("T1") ?? 0).toBeLessThanOrEqual(1);
    for (const t of ["T2", "T3", "T4"]) {
      expect(fresh.get(t) ?? 0).toBeGreaterThanOrEqual(1);
    }
  });

  it("is unchanged when the seed ledger is empty (back-compat)", () => {
    const pairings = generatePairings(teams(6), 1);
    const cts = courts(["1", "2", "3"], ["1"]);
    const withEmpty = assignCourts(pairings, cts, new Map());
    const without = assignCourts(pairings, cts);
    expect(withEmpty).toEqual(without);
  });
});
