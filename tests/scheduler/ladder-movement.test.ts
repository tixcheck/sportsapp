import { describe, expect, it } from "vitest";

import {
  applyLadderMovement,
  projectTierSizes,
  type LadderTier,
  type TierMovement,
} from "@/lib/scheduler/ladder-movement";

/** Tier of `n` teams, ids like "A1".."A5" — A1 finished top tonight. */
function tier(divisionId: string, n: number): LadderTier {
  return {
    divisionId,
    rankedTeamIds: Array.from({ length: n }, (_, i) => `${divisionId}${i + 1}`),
  };
}

const sizes = (r: { tiers: { teamIds: string[] }[] }) =>
  r.tiers.map((t) => t.teamIds.length);

describe("applyLadderMovement", () => {
  // The owner's worked example: 5/6/5, one team crossing each boundary.
  const balanced: TierMovement[] = [
    { divisionId: "A", down: 1, up: 0 },
    { divisionId: "B", down: 1, up: 1 },
    { divisionId: "C", down: 0, up: 1 },
  ];

  it("holds uneven tier sizes when the counts match at each boundary", () => {
    const res = applyLadderMovement(
      [tier("A", 5), tier("B", 6), tier("C", 5)],
      balanced,
    );
    expect(sizes(res)).toEqual([5, 6, 5]);
    expect(res.blocked).toEqual([]);
  });

  it("moves the right teams — bottom drops, top rises", () => {
    const res = applyLadderMovement(
      [tier("A", 5), tier("B", 6), tier("C", 5)],
      balanced,
    );
    // A5 finished last in Tier A, so it drops. B1 won Tier B, so it rises.
    expect(res.moves).toContainEqual({
      teamId: "A5",
      fromDivisionId: "A",
      toDivisionId: "B",
      direction: "down",
    });
    expect(res.moves).toContainEqual({
      teamId: "B1",
      fromDivisionId: "B",
      toDivisionId: "A",
      direction: "up",
    });
    expect(res.moves).toHaveLength(4);
  });

  it("seats a demoted team above the tier it joins, a promoted one below", () => {
    const res = applyLadderMovement(
      [tier("A", 5), tier("B", 6), tier("C", 5)],
      balanced,
    );
    const b = res.tiers.find((t) => t.divisionId === "B")!.teamIds;
    // A5 came down from a stronger tier; C1 came up from a weaker one.
    expect(b[0]).toBe("A5");
    expect(b[b.length - 1]).toBe("C1");
  });

  it("stays stable week after week when boundaries match", () => {
    expect(projectTierSizes([5, 6, 5], balanced, 10).at(-1)).toEqual([5, 6, 5]);
  });

  it("drifts when a boundary doesn't match — the owner's second case", () => {
    // Tier B sends 2 down but Tier C only sends 1 up: B shrinks, C grows.
    const drifting: TierMovement[] = [
      { divisionId: "A", down: 1, up: 0 },
      { divisionId: "B", down: 2, up: 1 },
      { divisionId: "C", down: 0, up: 1 },
    ];
    const res = applyLadderMovement(
      [tier("A", 5), tier("B", 6), tier("C", 5)],
      drifting,
    );
    expect(sizes(res)).toEqual([5, 5, 6]);

    // Projected forward, B drains into C — visible at setup, not week six.
    const projected = projectTierSizes([5, 6, 5], drifting, 4);
    expect(projected[0]).toEqual([5, 6, 5]);
    expect(projected[4]).toEqual([5, 2, 9]);
  });

  it("caps a tier that would send out more teams than it holds", () => {
    // Tier B is down to 2 and is configured to send 3 away. It can send at
    // most 2 — and since 2 arrive, it stays playable at 2.
    const res = applyLadderMovement(
      [tier("A", 5), tier("B", 2), tier("C", 9)],
      [
        { divisionId: "A", down: 1, up: 0 },
        { divisionId: "B", down: 2, up: 1 },
        { divisionId: "C", down: 0, up: 1 },
      ],
    );
    expect(sizes(res).every((n) => n >= 2)).toBe(true);
    expect(res.moves.filter((m) => m.fromDivisionId === "B")).toHaveLength(2);
    expect(
      res.blocked.some(
        (b) => b.divisionId === "B" && b.reason === "not-enough-teams",
      ),
    ).toBe(true);
  });

  it("holds a team back rather than leave a tier unable to play", () => {
    // Nothing comes into B, so sending 2 of its 3 teams down would leave 1.
    const res = applyLadderMovement(
      [tier("A", 5), tier("B", 3), tier("C", 5)],
      [
        { divisionId: "A", down: 0, up: 0 },
        { divisionId: "B", down: 2, up: 0 },
        { divisionId: "C", down: 0, up: 0 },
      ],
    );
    expect(sizes(res)).toEqual([5, 2, 6]);
    expect(res.blocked).toContainEqual({
      divisionId: "B",
      direction: "down",
      requested: 2,
      applied: 1,
      reason: "would-breach-minimum",
    });
  });

  it("never lets a tier send more teams than it has", () => {
    const res = applyLadderMovement(
      [tier("A", 4), tier("B", 3), tier("C", 4)],
      [
        { divisionId: "A", down: 0, up: 0 },
        { divisionId: "B", down: 3, up: 3 },
        { divisionId: "C", down: 0, up: 0 },
      ],
    );
    const moved = res.moves.filter((m) => m.fromDivisionId === "B");
    expect(moved.length).toBeLessThanOrEqual(3);
    // No team is both promoted and relegated.
    expect(new Set(moved.map((m) => m.teamId)).size).toBe(moved.length);
    expect(res.blocked.some((b) => b.reason === "not-enough-teams")).toBe(true);
  });

  it("pins the ends: nothing rises out of the top or drops out of the bottom", () => {
    const res = applyLadderMovement(
      [tier("A", 4), tier("B", 4)],
      [
        { divisionId: "A", down: 1, up: 2 },
        { divisionId: "B", down: 2, up: 1 },
      ],
    );
    expect(
      res.moves.some((m) => m.fromDivisionId === "A" && m.direction === "up"),
    ).toBe(false);
    expect(
      res.moves.some((m) => m.fromDivisionId === "B" && m.direction === "down"),
    ).toBe(false);
    expect(
      res.blocked.filter((b) => b.reason === "no-adjacent-tier"),
    ).toHaveLength(2);
  });

  it("keeps every team somewhere, and only once", () => {
    const start = [tier("A", 5), tier("B", 6), tier("C", 5)];
    const all = start.flatMap((t) => t.rankedTeamIds).sort();
    const res = applyLadderMovement(start, balanced);
    const after = res.tiers.flatMap((t) => t.teamIds).sort();
    expect(after).toEqual(all);
  });

  it("does nothing when every count is zero", () => {
    const res = applyLadderMovement(
      [tier("A", 5), tier("B", 6)],
      [
        { divisionId: "A", down: 0, up: 0 },
        { divisionId: "B", down: 0, up: 0 },
      ],
    );
    expect(res.moves).toEqual([]);
    expect(res.blocked).toEqual([]);
    expect(sizes(res)).toEqual([5, 6]);
  });

  it("handles a single tier as a no-op ladder", () => {
    const res = applyLadderMovement(
      [tier("A", 6)],
      [{ divisionId: "A", down: 2, up: 2 }],
    );
    expect(res.moves).toEqual([]);
    expect(sizes(res)).toEqual([6]);
  });
});

describe("projectTierSizes", () => {
  it("starts from the given sizes and never goes below the minimum", () => {
    const drifting: TierMovement[] = [
      { divisionId: "A", down: 2, up: 0 },
      { divisionId: "B", down: 0, up: 0 },
    ];
    const projected = projectTierSizes([6, 4], drifting, 8);
    expect(projected[0]).toEqual([6, 4]);
    for (const week of projected) {
      for (const n of week) expect(n).toBeGreaterThanOrEqual(2);
    }
    // A drains toward the floor and stops there rather than emptying.
    expect(projected.at(-1)![0]).toBe(2);
  });
});
