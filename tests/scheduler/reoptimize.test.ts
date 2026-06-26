import { describe, expect, it } from "vitest";

import {
  planReoptimize,
  type ReoptAssignment,
  type ReoptInputMatch,
} from "@/lib/scheduler/reoptimize";
import { poolPlan } from "@/lib/scheduler/pools";
import { generatePairings } from "@/lib/scheduler/round-robin";

/** Build the "current" schedule the way the old layout did: pool i → court
 *  i % courts, matches sequential in waves. Returns flat ReoptInputMatch[]. */
function buildCurrent(
  sizes: number[],
  courts: number,
  played: Set<string> = new Set(),
): ReoptInputMatch[] {
  const nextSlot = new Array<number>(courts).fill(0);
  const out: ReoptInputMatch[] = [];
  let offset = 0;
  sizes.forEach((size, pi) => {
    const teamIds = Array.from(
      { length: size },
      (_, i) => `T${offset + i + 1}`,
    );
    offset += size;
    const poolId = `P${pi}`;
    const court = pi % courts;
    const start = nextSlot[court];
    const pairs = generatePairings(
      teamIds,
      poolPlan(size).roundsPerTeam,
    ).flatMap((r) => r.pairs);
    pairs.forEach((p, k) => {
      const id = `${poolId}-${k}`;
      out.push({
        id,
        poolId,
        court: `Court ${court + 1}`,
        slot: start + k,
        homeTeamId: p.homeTeamId,
        awayTeamId: p.awayTeamId,
        played: played.has(id),
      });
    });
    nextSlot[court] = start + pairs.length;
  });
  return out;
}

/** Final (court, slot) of every match: assignment if present, else current. */
function finalState(
  matches: ReoptInputMatch[],
  assignments: ReoptAssignment[],
): { id: string; court: string; slot: number }[] {
  const byId = new Map(assignments.map((a) => [a.id, a]));
  return matches.map((m) => {
    const a = byId.get(m.id);
    return {
      id: m.id,
      court: a?.court ?? m.court ?? "Court 1",
      slot: a?.slot ?? m.slot,
    };
  });
}

function hasCollision(cells: { court: string; slot: number }[]): boolean {
  const seen = new Set<string>();
  for (const c of cells) {
    const key = `${c.court}@${c.slot}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function makespan(cells: { slot: number }[]): number {
  return cells.length === 0 ? 0 : Math.max(...cells.map((c) => c.slot)) + 1;
}

describe("planReoptimize — fresh event (nothing played)", () => {
  it("re-packs courts to cut makespan and never collides", () => {
    const sizes = [6, 4, 4]; // game counts 15, 6, 6
    const current = buildCurrent(sizes, 2);
    const out = planReoptimize(current, 2);
    const before = finalState(current, []);
    const after = finalState(current, out);

    expect(hasCollision(after)).toBe(false);
    expect(makespan(after)).toBeLessThan(makespan(before)); // 21 → 15
  });

  it("never returns a played match (there are none) and covers all", () => {
    const current = buildCurrent([4, 4], 2);
    const out = planReoptimize(current, 2);
    // Every match may be repositioned; all ids are valid pool matches.
    const ids = new Set(current.map((m) => m.id));
    for (const a of out) expect(ids.has(a.id)).toBe(true);
  });

  it("is deterministic", () => {
    const current = buildCurrent([6, 4, 4], 2);
    expect(planReoptimize(current, 2)).toEqual(planReoptimize(current, 2));
  });
});

describe("planReoptimize — live event (some games played)", () => {
  it("leaves a started pool untouched and never moves a played match", () => {
    // Pool P0 has a played game → the whole pool is left alone.
    const played = new Set(["P0-0"]);
    const current = buildCurrent([5, 5], 2, played);
    const out = planReoptimize(current, 2);

    const touchedIds = new Set(out.map((a) => a.id));
    // No P0 match (started pool) is touched.
    for (const m of current) {
      if (m.poolId === "P0") expect(touchedIds.has(m.id)).toBe(false);
    }
    // No played match is ever in the output.
    for (const a of out) {
      expect(current.find((m) => m.id === a.id)!.played).toBe(false);
    }
  });

  it("reorders an unplayed pool but keeps it on its current court", () => {
    const played = new Set(["P0-0"]); // P0 started; P1 fully unplayed
    const current = buildCurrent([5, 5], 2, played);
    const out = planReoptimize(current, 2);

    const p1 = out.filter((a) => a.id.startsWith("P1-"));
    expect(p1.length).toBeGreaterThan(0);
    // P1 is on Court 2 in the current layout; it must stay there.
    for (const a of p1) expect(a.court).toBe("Court 2");

    const after = finalState(current, out);
    expect(hasCollision(after)).toBe(false);
  });
});
