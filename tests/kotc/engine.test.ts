import { describe, expect, it } from "vitest";

import {
  applyEvent,
  initKotcPool,
  reduceKotc,
  overallResults,
  poolStandings,
  isRoundComplete,
  type KotcConfig,
  type KotcEvent,
  type KotcState,
} from "@/lib/kotc/engine";

const CFG: KotcConfig = { roundsPerSession: 3, pointCap: null };
const kingWin: KotcEvent = { type: "rally", winnerSide: "king" };
const challWin: KotcEvent = { type: "rally", winnerSide: "challenger" };

function play(s: KotcState, events: KotcEvent[], cfg = CFG): KotcState {
  return events.reduce((st, e) => applyEvent(st, e, cfg), s);
}

describe("initKotcPool", () => {
  it("seeds King=0, challenger=1, rest queued", () => {
    const s = initKotcPool(["A", "B", "C", "D"]);
    expect(s.kingTeamId).toBe("A");
    expect(s.challengerTeamId).toBe("B");
    expect(s.queue).toEqual(["C", "D"]);
    expect(s.roundIndex).toBe(0);
    expect(s.status).toBe("in_progress");
  });

  it("rejects pools smaller than 2", () => {
    expect(() => initKotcPool(["A"])).toThrow();
  });
});

describe("rally mechanics", () => {
  it("King win: scores a point, stays King, challenger rotates to the back", () => {
    const s = play(initKotcPool(["A", "B", "C", "D"]), [kingWin]);
    expect(s.kingTeamId).toBe("A");
    expect(s.totalPoints["A"]).toBe(1);
    expect(s.roundPoints["A"]).toBe(1);
    expect(s.challengerTeamId).toBe("C"); // next from queue
    expect(s.queue).toEqual(["D", "B"]); // beaten B to the back
  });

  it("challenger win: promotes to King, no point, dethroned King to the back", () => {
    const s = play(initKotcPool(["A", "B", "C", "D"]), [challWin]);
    expect(s.kingTeamId).toBe("B");
    expect(s.totalPoints["B"]).toBe(0); // promotion is not a point
    expect(s.challengerTeamId).toBe("C");
    expect(s.queue).toEqual(["D", "A"]);
  });

  it("tracks King streaks and resets them on dethronement", () => {
    // A wins 3 in a row, then is dethroned, then (later) reigns again.
    const s = play(initKotcPool(["A", "B", "C", "D"]), [
      kingWin, // A:1 streak1
      kingWin, // A:2 streak2
      kingWin, // A:3 streak3
      challWin, // A dethroned, streak ends at 3
    ]);
    expect(s.totalPoints["A"]).toBe(3);
    expect(s.roundLongest["A"]).toBe(3);
    expect(s.roundStreak["A"]).toBe(0);
  });

  it("handles a 2-pair pool (empty queue) without losing anyone", () => {
    const s = play(initKotcPool(["A", "B"]), [kingWin, kingWin]);
    expect(s.kingTeamId).toBe("A");
    expect(s.challengerTeamId).toBe("B");
    expect(s.totalPoints["A"]).toBe(2);
    expect(s.queue).toEqual([]);
  });
});

describe("round transition — re-seed by standings, reset per-round points", () => {
  // Hand-traced 4-pair round (see plan): A scores at seq1, C scores at seq3.
  it("re-seeds next round 1st=King, 2nd=challenger, rest in standings order; reached-first breaks the A/C tie", () => {
    const s0 = initKotcPool(["A", "B", "C", "D"]);
    const afterRound = play(s0, [
      kingWin, // seq1: A beats B  → A 1pt (reached seq1)
      challWin, // seq2: C beats A  → C King
      kingWin, // seq3: C beats D  → C 1pt (reached seq3)
      { type: "round_end" },
    ]);
    // A and C both have 1 round point + streak 1; A reached it first (seq1<seq3).
    expect(afterRound.kingTeamId).toBe("A");
    expect(afterRound.challengerTeamId).toBe("C");
    expect(afterRound.queue).toEqual(["B", "D"]);
    expect(afterRound.roundIndex).toBe(1);
    // Per-round reset…
    expect(afterRound.roundPoints).toEqual({ A: 0, B: 0, C: 0, D: 0 });
    // …cumulative carried forward.
    expect(afterRound.totalPoints["A"]).toBe(1);
    expect(afterRound.totalPoints["C"]).toBe(1);
    expect(afterRound.totalReachedSeq["A"]).toBe(1);
    expect(afterRound.totalReachedSeq["C"]).toBe(3);
  });

  it("sums per-round points into cumulative across rounds", () => {
    const s0 = initKotcPool(["A", "B", "C", "D"]);
    const s = play(s0, [
      kingWin, // round0: A 1pt
      { type: "round_end" }, // re-seed; A starts as King next round
      kingWin, // round1: King(A) 1pt → A cumulative 2
      { type: "round_end" },
      kingWin, // round2: 1pt
      { type: "round_end" }, // 3rd round_end → session complete
    ]);
    expect(s.status).toBe("complete");
    expect(s.totalPoints["A"]).toBe(3);
  });

  it("ignores events once the session is complete", () => {
    let s = initKotcPool(["A", "B"]);
    s = play(s, [
      { type: "round_end" },
      { type: "round_end" },
      { type: "round_end" }, // complete
    ]);
    const before = s.totalPoints["A"];
    s = applyEvent(s, kingWin, CFG);
    expect(s.totalPoints["A"]).toBe(before); // unchanged
  });
});

describe("pointCap predicate", () => {
  it("is never complete without a point cap", () => {
    expect(isRoundComplete(initKotcPool(["A", "B"]), CFG)).toBe(false); // CFG cap = null
  });

  it("flags a finished round when a pair hits the cap", () => {
    const cfg: KotcConfig = { roundsPerSession: 1, pointCap: 2 };
    let s = initKotcPool(["A", "B", "C"]);
    expect(isRoundComplete(s, cfg)).toBe(false);
    s = play(s, [kingWin, kingWin], cfg); // A reaches 2
    expect(isRoundComplete(s, cfg)).toBe(true);
  });
});

describe("reduceKotc + void (undo last rally)", () => {
  it("rebuilds state from the event log", () => {
    const events: KotcEvent[] = [kingWin, challWin, kingWin];
    const s = reduceKotc(["A", "B", "C", "D"], events, CFG);
    expect(s.seq).toBe(3);
  });

  it("applyEvent rejects a raw void event (it's resolved by reduceKotc)", () => {
    expect(() =>
      applyEvent(initKotcPool(["A", "B"]), { type: "void" }, CFG),
    ).toThrow();
  });

  it("void removes the most recent rally", () => {
    const withUndo = reduceKotc(
      ["A", "B", "C", "D"],
      [kingWin, kingWin, { type: "void" }],
      CFG,
    );
    const withoutLast = reduceKotc(["A", "B", "C", "D"], [kingWin], CFG);
    expect(withUndo.totalPoints).toEqual(withoutLast.totalPoints);
    expect(withUndo.seq).toBe(withoutLast.seq);
  });
});

describe("poolStandings / overallResults", () => {
  it("ranks the pool by cumulative results", () => {
    const s = reduceKotc(
      ["A", "B", "C", "D"],
      [kingWin, kingWin, kingWin], // A: 3 cumulative points
      CFG,
    );
    expect(overallResults(s).find((x) => x.teamId === "A")?.kingPoints).toBe(3);
    expect(poolStandings(s)[0].teamId).toBe("A");
  });
});
