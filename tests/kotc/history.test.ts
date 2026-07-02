import { describe, expect, it } from "vitest";

import { replayHistory } from "@/lib/kotc/history";
import type { KotcConfig, KotcEvent } from "@/lib/kotc/engine";

const CFG: KotcConfig = { roundsPerSession: 3, pointCap: null };
const PAIRS = ["A", "B", "C", "D"]; // King=A, challenger=B, queue C,D

const king = (): KotcEvent => ({ type: "rally", winnerSide: "king" });
const chal = (): KotcEvent => ({ type: "rally", winnerSide: "challenger" });

describe("replayHistory", () => {
  it("records who each King point was scored against", () => {
    // A beats B, then beats C (B requeued, C steps in).
    const { rallies, byPair } = replayHistory(PAIRS, [king(), king()], CFG);
    expect(rallies.map((r) => [r.winnerTeamId, r.challengerTeamId])).toEqual([
      ["A", "B"],
      ["A", "C"],
    ]);
    expect(byPair.get("A")!.beat).toEqual(["B", "C"]);
    expect(byPair.get("A")!.points).toBe(2);
  });

  it("tracks the longest streak as a point-number range", () => {
    // A scores 3 (pts 1–3); after 3 King wins the challenger has rotated back to
    // B, who dethrones A (no point), then scores its 1st point → run of 1.
    const events = [king(), king(), king(), chal(), king()];
    const { byPair } = replayHistory(PAIRS, events, CFG);
    expect(byPair.get("A")!.longestStreak).toBe(3);
    expect(byPair.get("A")!.longestRange).toEqual([1, 3]);
    expect(byPair.get("B")!.points).toBe(1);
    expect(byPair.get("B")!.longestRange).toEqual([1, 1]);
  });

  it("a challenger win awards no point and resets the streak", () => {
    const { rallies, byPair } = replayHistory(PAIRS, [chal()], CFG);
    expect(rallies[0].scored).toBe(false);
    expect(rallies[0].pointNumber).toBeNull();
    expect(byPair.get("A")!.points).toBe(0);
    expect(byPair.get("B")!.points).toBe(0); // promotion isn't a point
  });

  it("logs a serve error without scoring or breaking the King's run", () => {
    // A scores, challenger misses serve (no point), A scores → run of 2.
    const events: KotcEvent[] = [king(), { type: "serve_error" }, king()];
    const { rallies, byPair } = replayHistory(PAIRS, events, CFG);
    const err = rallies[1];
    expect(err.serveError).toBe(true);
    expect(err.scored).toBe(false);
    expect(err.pointNumber).toBeNull();
    expect(err.winnerTeamId).toBe("A"); // King held the court
    expect(byPair.get("A")!.points).toBe(2);
    expect(byPair.get("A")!.longestStreak).toBe(2); // run carried across the error
  });

  it("a void undoes the last rally", () => {
    const events: KotcEvent[] = [king(), king(), { type: "void" }];
    const { rallies, byPair } = replayHistory(PAIRS, events, CFG);
    expect(rallies).toHaveLength(1);
    expect(byPair.get("A")!.points).toBe(1);
    expect(byPair.get("A")!.beat).toEqual(["B"]);
  });
});
