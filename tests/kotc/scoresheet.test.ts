import { describe, expect, it } from "vitest";

import { buildScoreSheet } from "@/lib/kotc/scoresheet";
import type { KotcConfig, KotcEvent } from "@/lib/kotc/engine";

const CFG: KotcConfig = { roundsPerSession: 3, pointCap: null };
const PAIRS = ["A", "B", "C", "D"]; // King=A, challenger=B, queue C,D

const king = (): KotcEvent => ({ type: "rally", winnerSide: "king" });
const chal = (): KotcEvent => ({ type: "rally", winnerSide: "challenger" });

describe("buildScoreSheet", () => {
  it("records each point's number and opponent, paper-style", () => {
    // A beats B (pt1), then C (pt2).
    const sheet = buildScoreSheet(PAIRS, [king(), king()], CFG);
    expect(sheet).toHaveLength(1);
    const a = sheet[0].teams.find((t) => t.teamId === "A")!;
    expect(a.points).toEqual([
      { pointNumber: 1, opponentTeamId: "B", inStreak: true },
      { pointNumber: 2, opponentTeamId: "C", inStreak: true },
    ]);
    expect(a.totalPoints).toBe(2);
    expect(a.longestStreak).toBe(2);
  });

  it("flags consecutive King points as a streak, single points not", () => {
    // A scores 3 in a row (streak), loses to B, B scores 1 (not a streak).
    const sheet = buildScoreSheet(
      PAIRS,
      [king(), king(), king(), chal(), king()],
      CFG,
    );
    const a = sheet[0].teams.find((t) => t.teamId === "A")!;
    expect(a.points.map((p) => p.inStreak)).toEqual([true, true, true]);
    expect(a.longestStreak).toBe(3);
    const b = sheet[0].teams.find((t) => t.teamId === "B")!;
    expect(b.points).toHaveLength(1);
    expect(b.points[0].inStreak).toBe(false); // a lone point is not a streak
    expect(b.longestStreak).toBe(1);
  });

  it("splits points across rounds and marks the active round", () => {
    const sheet = buildScoreSheet(
      PAIRS,
      [king(), { type: "round_end" }, king()],
      CFG,
    );
    expect(sheet.map((r) => r.roundIndex)).toEqual([0, 1]);
    expect(sheet[0].active).toBe(false);
    expect(sheet[1].active).toBe(true);
    // Round 1 re-seeds by round-0 standings: A (1 pt) is King again.
    const r1a = sheet[1].teams.find((t) => t.teamId === "A")!;
    expect(r1a.totalPoints).toBe(1);
  });

  it("a void removes the last point from the sheet", () => {
    const events: KotcEvent[] = [king(), king(), { type: "void" }];
    const sheet = buildScoreSheet(PAIRS, events, CFG);
    const a = sheet[0].teams.find((t) => t.teamId === "A")!;
    expect(a.points).toHaveLength(1);
    expect(a.points[0]).toMatchObject({ pointNumber: 1, opponentTeamId: "B" });
  });
});
