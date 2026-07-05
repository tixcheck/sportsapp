import { describe, expect, it } from "vitest";

import {
  bracketMatchCourt,
  nextPowerOfTwo,
  seededBracketMatches,
} from "@/lib/scheduler/bracket";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`);

/** Court per persisted match — mirrors how generateBracketAction stamps them. */
function courtsFor(teamCount: number, courts: number[]) {
  const size = nextPowerOfTwo(teamCount);
  return seededBracketMatches(seeds(teamCount)).map((m) => ({
    round: m.round,
    position: m.position,
    court: bracketMatchCourt(m.round, m.position, size, courts),
  }));
}

const court = (rows: ReturnType<typeof courtsFor>, r: number, p: number) =>
  rows.find((x) => x.round === r && x.position === p)?.court;

describe("bracketMatchCourt — round-robin across courts", () => {
  it("8-team on 3 courts: round-1 spreads 1,2,3,1; semis 1,2; final blank", () => {
    const rows = courtsFor(8, [1, 2, 3]);
    expect(court(rows, 1, 1)).toBe(1);
    expect(court(rows, 1, 2)).toBe(2);
    expect(court(rows, 1, 3)).toBe(3); // the 3rd court is used
    expect(court(rows, 1, 4)).toBe(1);
    // semifinals
    expect(court(rows, 2, 1)).toBe(1);
    expect(court(rows, 2, 2)).toBe(2);
    // final (round 3) left for the organizer
    expect(court(rows, 3, 1)).toBeNull();
  });

  it("8-team on 2 courts: alternates 1,2,1,2 (back-compat)", () => {
    const rows = courtsFor(8, [1, 2]);
    expect(court(rows, 1, 1)).toBe(1);
    expect(court(rows, 1, 2)).toBe(2);
    expect(court(rows, 1, 3)).toBe(1);
    expect(court(rows, 1, 4)).toBe(2);
    expect(court(rows, 3, 1)).toBeNull();
  });

  it("16-team on 3 courts: round of 16 uses all three courts", () => {
    const rows = courtsFor(16, [1, 2, 3]);
    const r1 = [1, 2, 3, 4, 5, 6, 7, 8].map((p) => court(rows, 1, p));
    // positions 1..8 → (p−1) mod 3
    expect(r1).toEqual([1, 2, 3, 1, 2, 3, 1, 2]);
    expect(new Set(r1)).toEqual(new Set([1, 2, 3]));
    expect(court(rows, 4, 1)).toBeNull(); // final
  });

  it("honours a custom court list", () => {
    const rows = courtsFor(8, [5, 6, 7]);
    expect(court(rows, 1, 1)).toBe(5);
    expect(court(rows, 1, 2)).toBe(6);
    expect(court(rows, 1, 3)).toBe(7);
    expect(court(rows, 3, 1)).toBeNull();
  });

  it("dual tracks use independent court lists", () => {
    expect(bracketMatchCourt(1, 1, 8, [1, 2, 3])).toBe(1);
    expect(bracketMatchCourt(1, 3, 8, [1, 2, 3])).toBe(3);
    expect(bracketMatchCourt(1, 1, 8, [4, 5])).toBe(4); // consolation on 4,5
    expect(bracketMatchCourt(1, 2, 8, [4, 5])).toBe(5);
  });

  it("byes: no court for the omitted match; remaining spread across courts", () => {
    // 7-team bracket (size 8): seed 8 is a bye, so the 1-v-bye round-1 match is
    // never persisted and seed 1 drops into round-2 position 1.
    const rows = courtsFor(7, [1, 2, 3]);
    expect(court(rows, 1, 1)).toBeUndefined(); // omitted bye match — no row
    expect(court(rows, 1, 2)).toBe(2); // (2−1) mod 3
    expect(court(rows, 1, 3)).toBe(3);
    expect(court(rows, 1, 4)).toBe(1);
    expect(court(rows, 2, 1)).toBe(1); // bye team's first real match
    expect(court(rows, 3, 1)).toBeNull(); // final
  });

  it("a 2-team bracket is just a final → no auto court", () => {
    expect(bracketMatchCourt(1, 1, 2, [1, 2, 3])).toBeNull();
  });

  it("an empty court list yields no auto court", () => {
    expect(bracketMatchCourt(1, 1, 8, [])).toBeNull();
  });
});
