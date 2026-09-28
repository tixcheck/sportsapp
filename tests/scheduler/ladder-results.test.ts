import { describe, expect, it } from "vitest";

import {
  orderByPoints,
  typedTierOrder,
  type TypedResult,
} from "@/lib/scheduler/ladder-results";

const TIER = ["a", "b", "c", "d"];
const r = (teamId: string, rank: number | null, points: number | null = null) =>
  ({ teamId, rank, points }) satisfies TypedResult;

describe("typedTierOrder", () => {
  it("orders a fully ranked tier by rank, not by input order", () => {
    expect(
      typedTierOrder(TIER, [r("a", 3), r("b", 1), r("c", 4), r("d", 2)]),
    ).toEqual({ status: "complete", rankedTeamIds: ["b", "d", "a", "c"] });
  });

  it("says none when nobody is ranked, so the tier falls back to scores", () => {
    expect(typedTierOrder(TIER, [])).toEqual({ status: "none" });
    expect(
      typedTierOrder(
        TIER,
        TIER.map((id) => r(id, null, 12)),
      ),
    ).toEqual({ status: "none" });
  });

  // Moving teams on half an entry would relegate whoever wasn't typed yet.
  it("refuses a half-entered tier", () => {
    expect(typedTierOrder(TIER, [r("a", 1), r("b", 2)])).toEqual({
      status: "partial",
      entered: 2,
      of: 4,
    });
  });

  it("rejects two teams on the same rank", () => {
    const out = typedTierOrder(TIER, [
      r("a", 1),
      r("b", 1),
      r("c", 3),
      r("d", 4),
    ]);
    expect(out).toMatchObject({ status: "invalid" });
    expect(out.status === "invalid" && out.reason).toMatch(/ranked 1/);
  });

  it("rejects a rank beyond the tier's size", () => {
    expect(
      typedTierOrder(TIER, [r("a", 1), r("b", 2), r("c", 3), r("d", 5)]),
    ).toMatchObject({ status: "invalid" });
  });

  it("rejects a rank of zero, the easy slip from 0-based position", () => {
    expect(
      typedTierOrder(TIER, [r("a", 0), r("b", 1), r("c", 2), r("d", 3)]),
    ).toMatchObject({ status: "invalid" });
  });

  // The entry and the draw disagreeing about who was there is worth stopping on.
  it("rejects a ranked team that isn't in the tier", () => {
    expect(
      typedTierOrder(TIER, [
        r("a", 1),
        r("b", 2),
        r("c", 3),
        r("d", 4),
        r("stranger", 5),
      ]),
    ).toMatchObject({ status: "invalid" });
  });

  it("ignores an unranked row for someone outside the tier", () => {
    expect(
      typedTierOrder(TIER, [
        r("a", 1),
        r("b", 2),
        r("c", 3),
        r("d", 4),
        r("stranger", null, 10),
      ]),
    ).toMatchObject({ status: "complete" });
  });

  it("handles a seven-team tier", () => {
    const seven = ["a", "b", "c", "d", "e", "f", "g"];
    const out = typedTierOrder(
      seven,
      seven.map((id, i) => r(id, 7 - i)),
    );
    expect(out).toEqual({
      status: "complete",
      rankedTeamIds: [...seven].reverse(),
    });
  });
});

describe("orderByPoints", () => {
  it("puts the highest total first", () => {
    expect(
      orderByPoints([
        { teamId: "a", points: 18 },
        { teamId: "b", points: 24 },
        { teamId: "c", points: 6 },
      ]),
    ).toEqual({ teamIds: ["b", "a", "c"], ties: [] });
  });

  // A tie keeps the organizer's order, so re-sorting never undoes their call.
  it("keeps the incoming order within a tie and reports it", () => {
    const out = orderByPoints([
      { teamId: "x", points: 12 },
      { teamId: "a", points: 20 },
      { teamId: "y", points: 12 },
    ]);
    expect(out.teamIds).toEqual(["a", "x", "y"]);
    expect(out.ties).toEqual([["x", "y"]]);

    const flipped = orderByPoints([
      { teamId: "y", points: 12 },
      { teamId: "a", points: 20 },
      { teamId: "x", points: 12 },
    ]);
    expect(flipped.teamIds).toEqual(["a", "y", "x"]);
  });

  it("sends teams with no points yet to the bottom, in their order", () => {
    expect(
      orderByPoints([
        { teamId: "n1", points: null },
        { teamId: "a", points: 4 },
        { teamId: "n2", points: null },
      ]).teamIds,
    ).toEqual(["a", "n1", "n2"]);
  });

  it("does not count blanks as a tie", () => {
    expect(
      orderByPoints([
        { teamId: "n1", points: null },
        { teamId: "n2", points: null },
      ]).ties,
    ).toEqual([]);
  });

  it("treats zero as a score, not a blank", () => {
    expect(
      orderByPoints([
        { teamId: "z", points: 0 },
        { teamId: "n", points: null },
        { teamId: "a", points: 2 },
      ]).teamIds,
    ).toEqual(["a", "z", "n"]);
  });
});
