import { describe, expect, it } from "vitest";

import {
  statsEmptyReason,
  type StatsReadiness,
} from "@/lib/stats/empty-reason";

const r = (over: Partial<StatsReadiness> = {}): StatsReadiness => ({
  tracksAppearances: true,
  scoredMatches: 0,
  lineupMatches: 0,
  bothMatches: 0,
  ...over,
});

describe("statsEmptyReason", () => {
  // A team-wide league credits every player on the team, so a score is the
  // only thing it ever waits for.
  it("keeps the original sentence where only a score is needed", () => {
    expect(
      statsEmptyReason(r({ tracksAppearances: false, scoredMatches: 3 })),
    ).toBe("Player stats appear once scores are recorded.");
  });

  it("asks for both when neither has been done", () => {
    expect(statsEmptyReason(r())).toBe(
      "Player stats appear once you record a score and who played.",
    );
  });

  it("asks only for what is missing", () => {
    expect(statsEmptyReason(r({ lineupMatches: 4 }))).toBe(
      "Lineups are in. Player stats appear once those games have scores.",
    );
    expect(statsEmptyReason(r({ scoredMatches: 4 }))).toBe(
      "Scores are in. Player stats appear once you record who played.",
    );
  });

  // Big Shoots, 2026-09-14: a score on week 1, lineups on week 2, and an empty
  // table telling the organizer to record the scores they had already entered.
  it("names the trap where both exist but never on the same game", () => {
    expect(
      statsEmptyReason(
        r({ scoredMatches: 1, lineupMatches: 6, bothMatches: 0 }),
      ),
    ).toBe(
      "Scores and lineups are in, but not on the same games yet — a game needs both before it counts towards anyone.",
    );
  });

  it("says so plainly when a game has both and still yields nothing", () => {
    expect(
      statsEmptyReason(
        r({ scoredMatches: 2, lineupMatches: 2, bothMatches: 2 }),
      ),
    ).toBe("No player has a scored set recorded against them yet.");
  });

  // The sentence an organizer is most likely to see first, and the one that
  // must never tell them to redo work they have done.
  it("never asks for scores when scores exist", () => {
    for (const both of [0, 1]) {
      const message = statsEmptyReason(
        r({ scoredMatches: 5, lineupMatches: 5, bothMatches: both }),
      );
      expect(message).not.toMatch(/once .*scores are recorded/);
    }
  });
});
