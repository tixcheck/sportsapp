import { describe, expect, it } from "vitest";

import { overallRows } from "@/lib/standings/overall";
import type { StandingsGroup, StandingsRowView } from "@/lib/standings/compute";

/**
 * A standings row carrying only what the cross-pool ranking reads: finishing
 * position within its pool, then set ratio and point ratio to separate teams
 * that finished level. Everything else is display padding.
 */
function row(
  teamId: string,
  position: number,
  setRatio: number,
  pointRatio: number,
): StandingsRowView {
  return {
    teamId,
    teamName: teamId,
    mw: 0,
    ml: 0,
    mt: 0,
    sw: 0,
    sl: 0,
    pf: 0,
    pa: 0,
    setRatio,
    pointRatio,
    position,
    projected: false,
    tiebreakerStep: 1,
    tiebreakerValue: 0,
    tiedWith: [teamId],
    explanation: "",
    withdrawn: false,
    gamesScheduled: 3,
    explainer: { step: 1, heading: "", entries: [] },
    weekly: [],
  };
}

function pool(name: string, rows: StandingsRowView[]): StandingsGroup {
  return {
    poolId: name,
    poolName: name,
    divisionId: "d1",
    divisionName: "Mens",
    rows,
  };
}

const names = (rows: StandingsRowView[]) => rows.map((r) => r.teamId);

describe("overallRows", () => {
  it("puts every pool winner above every runner-up", () => {
    const out = overallRows([
      pool("A", [row("a1", 1, 3, 2), row("a2", 2, 1, 1)]),
      pool("B", [row("b1", 1, 2, 1.5), row("b2", 2, 1.5, 1.2)]),
    ]);
    // Winners first (best set ratio leads), then the runners-up. b2 beats a2 on
    // set ratio but still ranks below both winners — finishing position leads.
    expect(names(out)).toEqual(["a1", "b1", "b2", "a2"]);
  });

  /**
   * The bug this guards. `position` is the team's rank WITHIN its pool, and the
   * table renders that field for both the rank column and the leader's claret
   * highlight. Handing the rows over re-ordered but un-renumbered produced a
   * table reading 1, 1, 2, 2 — and two teams both styled as the leader.
   */
  it("renumbers positions 1..N instead of repeating pool ranks", () => {
    const out = overallRows([
      pool("A", [row("a1", 1, 3, 2), row("a2", 2, 1, 1)]),
      pool("B", [row("b1", 1, 2, 1.5), row("b2", 2, 1.5, 1.2)]),
    ]);
    expect(out.map((r) => r.position)).toEqual([1, 2, 3, 4]);
  });

  it("separates teams who finished level on set ratio, then point ratio", () => {
    const out = overallRows([
      pool("A", [row("a1", 1, 2, 1.1)]),
      pool("B", [row("b1", 1, 2, 1.9)]),
      pool("C", [row("c1", 1, 5, 1.0)]),
    ]);
    // c1 leads on set ratio; a1 and b1 are level there, so point ratio decides.
    expect(names(out)).toEqual(["c1", "b1", "a1"]);
  });

  it("returns every team exactly once, even with uneven pools", () => {
    const out = overallRows([
      pool("A", [
        row("a1", 1, 3, 2),
        row("a2", 2, 1, 1),
        row("a3", 3, 0.5, 0.5),
      ]),
      pool("B", [row("b1", 1, 2, 1.5)]),
    ]);
    expect(names(out).sort()).toEqual(["a1", "a2", "a3", "b1"]);
    expect(out).toHaveLength(4);
  });

  // The rows belong to the caller's per-pool tables, which render alongside
  // this one. Renumbering in place would corrupt the pool view.
  it("does not mutate the caller's rows", () => {
    const a2 = row("a2", 2, 1, 1);
    const groups = [pool("A", [row("a1", 1, 3, 2), a2])];
    overallRows(groups);
    expect(a2.position).toBe(2);
  });

  it("handles no groups", () => {
    expect(overallRows([])).toEqual([]);
  });
});
