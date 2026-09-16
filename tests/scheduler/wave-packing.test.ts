/**
 * Wave packing — the no-referee pool layout.
 *
 * Driven by Summer Forever (Beach Barbiez, Sat Sep 19 2026): 24 teams, two
 * divisions of 12, 3 pools of 4 each, 8 courts, and no team reffing. The old
 * layout gave one pool per court — 6 pools, 6 courts, 6 waves. Packing across
 * pool boundaries reaches the arithmetic floor of 5, which is the 45 minutes
 * the organizer asked for.
 */
import { describe, expect, it } from "vitest";

import {
  interleaveCourts,
  packPoolsIntoWaves,
} from "@/lib/scheduler/wave-packing";
import type { LayoutPool } from "@/lib/scheduler/pools";

/** A pool of 4 as a full round robin: 3 rounds of 2 team-disjoint games. */
function poolOfFour(prefix: string): LayoutPool {
  const [a, b, c, d] = [1, 2, 3, 4].map((i) => `${prefix}${i}`);
  return {
    teamIds: [a, b, c, d],
    rounds: [
      {
        round: 1,
        pairs: [
          { homeTeamId: a, awayTeamId: b },
          { homeTeamId: c, awayTeamId: d },
        ],
        byeTeamId: null,
      },
      {
        round: 2,
        pairs: [
          { homeTeamId: a, awayTeamId: c },
          { homeTeamId: b, awayTeamId: d },
        ],
        byeTeamId: null,
      },
      {
        round: 3,
        pairs: [
          { homeTeamId: a, awayTeamId: d },
          { homeTeamId: b, awayTeamId: c },
        ],
        byeTeamId: null,
      },
    ],
  };
}

const wavesOf = (out: { slot: number }[]) =>
  new Set(out.map((m) => m.slot)).size;

describe("packPoolsIntoWaves", () => {
  describe("one division: 3 pools of 4 on 4 courts", () => {
    const pools = [poolOfFour("A"), poolOfFour("B"), poolOfFour("C")];
    const out = packPoolsIntoWaves(pools, [1, 3, 5, 7]);

    it("schedules every game exactly once", () => {
      expect(out).toHaveLength(18);
    });

    // 18 games over 4 courts cannot finish in fewer than ceil(18/4) = 5.
    it("hits the arithmetic floor of 5 waves", () => {
      expect(wavesOf(out)).toBe(5);
    });

    it("never asks a team to play twice at once", () => {
      const byWave = new Map<number, string[]>();
      for (const m of out) {
        const list = byWave.get(m.slot) ?? [];
        list.push(m.homeTeamId, m.awayTeamId);
        byWave.set(m.slot, list);
      }
      for (const [, teams] of byWave) {
        expect(new Set(teams).size).toBe(teams.length);
      }
    });

    it("never double-books a court", () => {
      const cells = out.map((m) => `${m.slot}:${m.court}`);
      expect(new Set(cells).size).toBe(cells.length);
    });

    it("only uses the courts it was given", () => {
      expect([...new Set(out.map((m) => m.court))].sort()).toEqual([
        1, 3, 5, 7,
      ]);
    });

    it("still gives every team its 3 games", () => {
      const played = new Map<string, number>();
      for (const m of out) {
        for (const t of [m.homeTeamId, m.awayTeamId]) {
          played.set(t, (played.get(t) ?? 0) + 1);
        }
      }
      expect(played.size).toBe(12);
      for (const [, n] of played) expect(n).toBe(3);
    });

    // Nobody can have a wave off between EVERY game here, and that is
    // arithmetic rather than a shortcoming: 3 games with a gap of 2 everywhere
    // forces every team into waves 0, 2 and 4, which would put all 12 teams —
    // 6 games — into wave 0 on 4 courts. So the guarantees worth holding are
    // that nobody plays three on the trot, and everybody gets a real break
    // somewhere.
    const slotsByTeam = () => {
      const waves = new Map<string, number[]>();
      for (const m of out) {
        for (const t of [m.homeTeamId, m.awayTeamId]) {
          waves.set(t, [...(waves.get(t) ?? []), m.slot]);
        }
      }
      return waves;
    };

    it("never makes a team play three waves in a row", () => {
      for (const [, slots] of slotsByTeam()) {
        const sorted = [...slots].sort((a, b) => a - b);
        for (let i = 2; i < sorted.length; i++) {
          const backToBack =
            sorted[i] - sorted[i - 1] === 1 &&
            sorted[i - 1] - sorted[i - 2] === 1;
          expect(backToBack).toBe(false);
        }
      }
    });

    it("gives every team at least one wave off somewhere", () => {
      for (const [, slots] of slotsByTeam()) {
        const sorted = [...slots].sort((a, b) => a - b);
        const gaps = sorted.slice(1).map((s, i) => s - sorted[i]);
        expect(Math.max(...gaps)).toBeGreaterThanOrEqual(2);
      }
    });

    // The shape the organizer will actually read off the sheet: two pools per
    // wave, rotating, with the odd pool-round left over at the end.
    it("rotates the pools instead of marching one through", () => {
      const poolsPerWave = new Map<number, Set<number>>();
      for (const m of out) {
        const set = poolsPerWave.get(m.slot) ?? new Set<number>();
        set.add(m.poolIndex);
        poolsPerWave.set(m.slot, set);
      }
      const shape = [...poolsPerWave.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, set]) => [...set].sort());
      expect(shape).toEqual([[0, 1], [0, 2], [1, 2], [0, 1], [2]]);
    });

    it("assigns nobody to referee", () => {
      expect(out.every((m) => m.refTeamId === null)).toBe(true);
    });

    it("is deterministic", () => {
      expect(packPoolsIntoWaves(pools, [1, 3, 5, 7])).toEqual(out);
    });
  });

  // The whole event on one court list, as a cross-check on the floor: 36 games
  // over 8 courts is also 5 waves, so splitting the courts by division costs
  // nothing in time.
  it("36 games on 8 courts is also 5 waves", () => {
    const pools = ["A", "B", "C", "D", "E", "F"].map(poolOfFour);
    const out = packPoolsIntoWaves(pools, [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(out).toHaveLength(36);
    expect(wavesOf(out)).toBe(5);
  });

  it("one pool on spare courts runs its 2 disjoint games at once", () => {
    const out = packPoolsIntoWaves([poolOfFour("A")], [1, 2, 3, 4]);
    expect(out).toHaveLength(6);
    expect(wavesOf(out)).toBe(3); // 4 teams can only ever play 2 games at once
  });

  it("falls back to a single court rather than scheduling nothing", () => {
    const out = packPoolsIntoWaves([poolOfFour("A")], []);
    expect(out).toHaveLength(6);
    expect(wavesOf(out)).toBe(6);
    expect([...new Set(out.map((m) => m.court))]).toEqual([1]);
  });

  it("handles an empty draw", () => {
    expect(packPoolsIntoWaves([], [1, 2])).toEqual([]);
  });
});

describe("interleaveCourts", () => {
  it("splits 8 courts between two divisions as odds and evens", () => {
    expect(interleaveCourts(8, 2)).toEqual([
      [1, 3, 5, 7],
      [2, 4, 6, 8],
    ]);
  });

  it("splits unevenly rather than dropping a court", () => {
    expect(interleaveCourts(7, 2)).toEqual([
      [1, 3, 5, 7],
      [2, 4, 6],
    ]);
  });

  it("gives a single division everything", () => {
    expect(interleaveCourts(6, 1)).toEqual([[1, 2, 3, 4, 5, 6]]);
  });

  it("survives more divisions than courts", () => {
    expect(interleaveCourts(2, 3)).toEqual([[1], [2], []]);
  });
});
