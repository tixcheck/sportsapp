import { describe, expect, it } from "vitest";

import {
  assignBracketTimes,
  bracketMatchCourt,
  bracketSlotKey,
  nextPowerOfTwo,
  seededBracketMatches,
  type BracketTrack,
} from "@/lib/scheduler/bracket";

const M = 60_000;
const SLOT = 45 * M;
const seeds = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`);

/** Build the timing inputs exactly as generateBracketAction does for a track. */
function inputs(
  teamCount: number,
  pair: [number, number],
  track: BracketTrack | null = null,
) {
  const size = nextPowerOfTwo(teamCount);
  return seededBracketMatches(seeds(teamCount)).map((m) => ({
    round: m.round,
    position: m.position,
    track,
    court: bracketMatchCourt(m.round, m.position, size, pair),
  }));
}

const at = (
  t: Map<string, number>,
  track: BracketTrack | null,
  r: number,
  p: number,
) => t.get(bracketSlotKey(track, r, p));

describe("assignBracketTimes", () => {
  it("8-team: parallel courts, semi at T+90 (not T+45), final waits for both semis", () => {
    const t = assignBracketTimes(inputs(8, [1, 2]), 0, SLOT);
    // round 1 — court 1 sequential, court 2 parallel
    expect(at(t, null, 1, 1)).toBe(0);
    expect(at(t, null, 1, 2)).toBe(45 * M);
    expect(at(t, null, 1, 3)).toBe(0); // court 2 starts at T too
    expect(at(t, null, 1, 4)).toBe(45 * M);
    // semifinals wait for BOTH feeders (the later one ends at T+90)
    expect(at(t, null, 2, 1)).toBe(90 * M);
    expect(at(t, null, 2, 2)).toBe(90 * M);
    // final waits for both semis (each ends at T+135)
    expect(at(t, null, 3, 1)).toBe(135 * M);
  });

  it("4-team: two semis run in parallel, final after both", () => {
    const t = assignBracketTimes(inputs(4, [1, 2]), 0, SLOT);
    expect(at(t, null, 1, 1)).toBe(0);
    expect(at(t, null, 1, 2)).toBe(0); // different court, parallel
    expect(at(t, null, 2, 1)).toBe(45 * M); // final waits for both
  });

  it("16-team: parallel courts in round 1; final waits for both semis", () => {
    const t = assignBracketTimes(inputs(16, [1, 2]), 0, SLOT);
    expect(at(t, null, 1, 1)).toBe(0);
    expect(at(t, null, 1, 5)).toBe(0); // court 2 parallel
    // court 1 hosts round-1 positions 1–4 back-to-back
    expect(at(t, null, 1, 2)).toBe(45 * M);
    expect(at(t, null, 1, 3)).toBe(90 * M);
    expect(at(t, null, 1, 4)).toBe(135 * M);
    // the final (round 4) starts at the later of the two semifinal ends
    const semi1End = at(t, null, 3, 1)! + SLOT;
    const semi2End = at(t, null, 3, 2)! + SLOT;
    expect(at(t, null, 4, 1)).toBe(Math.max(semi1End, semi2End));
  });

  it("byes: the omitted match has no slot; the bye team's match waits only on its real feeder", () => {
    // 7 teams (size 8): seed 8 is a bye, so round-1 position 1 isn't persisted.
    const t = assignBracketTimes(inputs(7, [1, 2]), 0, SLOT);
    expect(at(t, null, 1, 1)).toBeUndefined(); // omitted bye match
    expect(at(t, null, 1, 2)).toBe(0); // remaining court-1 match
    // round-2 pos1 holds the bye team; its only real feeder (pos2) ends at T+45,
    // and the missing feeder (pos1) adds no constraint → starts at T+45.
    expect(at(t, null, 2, 1)).toBe(45 * M);
    expect(at(t, null, 3, 1)).toBe(135 * M); // final
  });

  it("dual tracks: independent pairs both start at T and run in parallel", () => {
    const t = assignBracketTimes(
      [
        ...inputs(4, [1, 2], "championship"),
        ...inputs(4, [3, 4], "consolation"),
      ],
      0,
      SLOT,
    );
    expect(at(t, "championship", 1, 1)).toBe(0);
    expect(at(t, "consolation", 1, 1)).toBe(0); // courts 3/4 — no contention
  });

  it("overlapping track courts queue on the shared court number", () => {
    const t = assignBracketTimes(
      [
        ...inputs(4, [1, 2], "championship"),
        ...inputs(4, [1, 2], "consolation"),
      ],
      0,
      SLOT,
    );
    expect(at(t, "championship", 1, 1)).toBe(0); // gets court 1 first
    expect(at(t, "consolation", 1, 1)).toBe(45 * M); // queues behind it
  });

  it("propagates the start time", () => {
    const base = 9 * 3600 * M; // some non-zero start
    const t = assignBracketTimes(inputs(8, [1, 2]), base, SLOT);
    expect(at(t, null, 1, 1)).toBe(base);
    expect(at(t, null, 2, 1)).toBe(base + 90 * M);
  });
});
