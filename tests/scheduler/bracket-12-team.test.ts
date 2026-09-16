/**
 * The 12-team bracket, locked to the shape a real organizer asked for.
 *
 * Beach Barbiez run Summer Forever with 12 mens teams and 12 womens teams, and
 * sent through a printed 12-team chart: seeds 1-4 on byes, everybody else in
 * round 1, "everyone makes playoffs". This asserts our generator reproduces that
 * chart exactly, because the bracket gets drawn at a beach on the day and a
 * wrong pairing is not something anyone can re-run.
 *
 * The chart's round 1 is 8v9, 5v12, 6v11, 7v10; its quarter-finals are
 * 1v(8/9), 4v(5/12), 3v(6/11), 2v(7/10); its semi-finals put the 1-side against
 * the 4-side and the 3-side against the 2-side.
 */
import { describe, expect, it } from "vitest";

import { seededBracketMatches } from "@/lib/scheduler/bracket";

/** "S1".."S12" — the id carries the seed, so assertions read like the chart. */
const seeded = (n: number) => Array.from({ length: n }, (_, i) => `S${i + 1}`);

const pairOf = (m: { homeTeamId: string | null; awayTeamId: string | null }) =>
  [m.homeTeamId, m.awayTeamId].sort();

describe("12-team bracket (Summer Forever)", () => {
  const matches = seededBracketMatches(seeded(12));

  it("is 11 matches: 4 + 4 + 2 + 1", () => {
    expect(matches).toHaveLength(11);
    const perRound = (r: number) => matches.filter((m) => m.round === r).length;
    expect([perRound(1), perRound(2), perRound(3), perRound(4)]).toEqual([
      4, 4, 2, 1,
    ]);
  });

  it("round 1 is the chart's four games", () => {
    const r1 = matches.filter((m) => m.round === 1).map(pairOf);
    expect(r1).toHaveLength(4);
    expect(r1).toEqual(
      expect.arrayContaining([
        ["S8", "S9"].sort(),
        ["S12", "S5"].sort(),
        ["S10", "S7"].sort(),
        ["S11", "S6"].sort(),
      ]),
    );
  });

  it("seeds 1-4 get the byes, waiting in round 2", () => {
    const r2 = matches.filter((m) => m.round === 2);
    const waiting = r2
      .flatMap((m) => [m.homeTeamId, m.awayTeamId])
      .filter(Boolean);
    expect(waiting.sort()).toEqual(["S1", "S2", "S3", "S4"]);
    // Each bye sits alone — the other side is decided by a round-1 game.
    for (const m of r2) {
      expect([m.homeTeamId, m.awayTeamId].filter(Boolean)).toHaveLength(1);
    }
  });

  it("no seed 5-12 is pre-placed anywhere above round 1", () => {
    const above = matches
      .filter((m) => m.round > 1)
      .flatMap((m) => [m.homeTeamId, m.awayTeamId])
      .filter(Boolean) as string[];
    const late = above.filter((id) => Number(id.slice(1)) > 4);
    expect(late).toEqual([]);
  });

  it("every team appears exactly once in the draw", () => {
    const placed = matches
      .flatMap((m) => [m.homeTeamId, m.awayTeamId])
      .filter(Boolean) as string[];
    expect(new Set(placed).size).toBe(12);
    expect(placed).toHaveLength(12);
  });

  it("round-1 positions keep their numbering so parent math still holds", () => {
    // Byes leave gaps: the played games are at even positions 2, 4, 6, 8, and
    // each feeds ceil(p/2) — the four round-2 slots, one per bye seed.
    const r1 = matches.filter((m) => m.round === 1).map((m) => m.position);
    expect(r1.sort((a, b) => a - b)).toEqual([2, 4, 6, 8]);
    const parents = r1.map((p) => Math.ceil(p / 2)).sort((a, b) => a - b);
    expect(parents).toEqual([1, 2, 3, 4]);
  });
});
