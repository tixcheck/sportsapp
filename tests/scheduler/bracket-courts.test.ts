import { describe, expect, it } from "vitest";

import {
  bracketMatchCourt,
  nextPowerOfTwo,
  seededBracketMatches,
} from "@/lib/scheduler/bracket";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`);

/** Court per persisted match — mirrors how generateBracketAction stamps them. */
function courtsFor(teamCount: number, pair: [number, number]) {
  const size = nextPowerOfTwo(teamCount);
  return seededBracketMatches(seeds(teamCount)).map((m) => ({
    round: m.round,
    position: m.position,
    court: bracketMatchCourt(m.round, m.position, size, pair),
  }));
}

const court = (rows: ReturnType<typeof courtsFor>, r: number, p: number) =>
  rows.find((x) => x.round === r && x.position === p)?.court;

describe("bracketMatchCourt — top/bottom half rule", () => {
  it("8-team: 1v8 & 4v5 → court 1; 2v7 & 3v6 → court 2; semis follow; final blank", () => {
    const rows = courtsFor(8, [1, 2]);
    // round 1: positions 1,2 = top half → court 1; 3,4 = bottom → court 2
    expect(court(rows, 1, 1)).toBe(1);
    expect(court(rows, 1, 2)).toBe(1);
    expect(court(rows, 1, 3)).toBe(2);
    expect(court(rows, 1, 4)).toBe(2);
    // semifinals inherit their half's court
    expect(court(rows, 2, 1)).toBe(1);
    expect(court(rows, 2, 2)).toBe(2);
    // final (round 3) left for the organizer
    expect(court(rows, 3, 1)).toBeNull();
  });

  it("4-team: the two semis split across the pair, final blank", () => {
    const rows = courtsFor(4, [1, 2]);
    expect(court(rows, 1, 1)).toBe(1);
    expect(court(rows, 1, 2)).toBe(2);
    expect(court(rows, 2, 1)).toBeNull(); // final
  });

  it("16-team: each round splits at its midpoint; final blank", () => {
    const rows = courtsFor(16, [1, 2]);
    // round 1: pos 1–4 → court 1, 5–8 → court 2
    for (const p of [1, 2, 3, 4]) expect(court(rows, 1, p)).toBe(1);
    for (const p of [5, 6, 7, 8]) expect(court(rows, 1, p)).toBe(2);
    // quarters: 1–2 → 1, 3–4 → 2
    expect(court(rows, 2, 1)).toBe(1);
    expect(court(rows, 2, 2)).toBe(1);
    expect(court(rows, 2, 3)).toBe(2);
    expect(court(rows, 2, 4)).toBe(2);
    // semis: 1 → 1, 2 → 2
    expect(court(rows, 3, 1)).toBe(1);
    expect(court(rows, 3, 2)).toBe(2);
    // final (round 4)
    expect(court(rows, 4, 1)).toBeNull();
  });

  it("honours a custom court pair", () => {
    const rows = courtsFor(8, [5, 6]);
    expect(court(rows, 1, 1)).toBe(5);
    expect(court(rows, 1, 3)).toBe(6);
    expect(court(rows, 2, 1)).toBe(5);
    expect(court(rows, 3, 1)).toBeNull();
  });

  it("dual tracks use independent pairs (champ [1,2], conso [3,4])", () => {
    // Each track is stamped against its own pair (as the action does per track).
    expect(bracketMatchCourt(1, 1, 8, [1, 2])).toBe(1); // championship top half
    expect(bracketMatchCourt(1, 3, 8, [1, 2])).toBe(2); // championship bottom
    expect(bracketMatchCourt(1, 1, 8, [3, 4])).toBe(3); // consolation top half
    expect(bracketMatchCourt(1, 3, 8, [3, 4])).toBe(4); // consolation bottom
  });

  it("byes: no court for the omitted match; the bye team's first real match gets its half's court", () => {
    // 7-team bracket (size 8): seed 8 is a bye, so the 1-v-bye round-1 match is
    // never persisted and seed 1 drops into round-2 position 1.
    const rows = courtsFor(7, [1, 2]);
    expect(court(rows, 1, 1)).toBeUndefined(); // omitted bye match — no row
    expect(court(rows, 1, 2)).toBe(1); // remaining top-half match
    expect(court(rows, 1, 3)).toBe(2);
    expect(court(rows, 1, 4)).toBe(2);
    expect(court(rows, 2, 1)).toBe(1); // bye team's first real match → court 1
    expect(court(rows, 2, 2)).toBe(2);
    expect(court(rows, 3, 1)).toBeNull(); // final
  });

  it("a 2-team bracket is just a final → no auto court", () => {
    expect(bracketMatchCourt(1, 1, 2, [1, 2])).toBeNull();
  });
});
