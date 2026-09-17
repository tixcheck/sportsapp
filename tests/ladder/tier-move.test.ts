import { describe, expect, it } from "vitest";

import { canMoveTier, type TierMoveFacts } from "@/lib/ladder/tier-move";

const base: TierMoveFacts = {
  hasPlacements: false,
  fromDivisionId: "tier-1",
  toDivisionId: "tier-2",
  targetInCompetition: true,
  withdrawn: false,
};

describe("canMoveTier", () => {
  it("allows a pre-season move", () => {
    expect(canMoveTier(base)).toEqual({ ok: true });
  });

  it("allows sorting a team that was never in a tier", () => {
    expect(canMoveTier({ ...base, fromDivisionId: null })).toEqual({
      ok: true,
    });
  });

  it("allows un-sorting a team out of every tier", () => {
    expect(canMoveTier({ ...base, toDivisionId: null })).toEqual({ ok: true });
  });

  // Not an error: the dropdown fires on every change, including a re-pick of
  // the tier the team is already in.
  it("treats a move to the same tier as a no-op, not a failure", () => {
    expect(canMoveTier({ ...base, toDivisionId: "tier-1" })).toEqual({
      ok: false,
      noop: true,
    });
    expect(
      canMoveTier({ ...base, fromDivisionId: null, toDivisionId: null }),
    ).toEqual({ ok: false, noop: true });
  });

  // Once week 1 is drawn the night is built from ladder_placements, so changing
  // division_id would look like it worked and move nobody.
  it("refuses once the season has started, and says why", () => {
    const check = canMoveTier({ ...base, hasPlacements: true });
    expect(check.ok).toBe(false);
    expect(check).toMatchObject({
      reason: expect.stringContaining("season has started"),
    });
  });

  it("refuses a withdrawn team", () => {
    const check = canMoveTier({ ...base, withdrawn: true });
    expect(check).toMatchObject({
      reason: expect.stringContaining("withdrawn"),
    });
  });

  it("refuses a tier belonging to another competition", () => {
    const check = canMoveTier({ ...base, targetInCompetition: false });
    expect(check).toMatchObject({
      reason: expect.stringContaining("isn't part of this league"),
    });
  });

  // The started-season rule outranks the rest: it is the one that would
  // silently do nothing rather than visibly fail.
  it("reports the started season ahead of other problems", () => {
    const check = canMoveTier({
      ...base,
      hasPlacements: true,
      withdrawn: true,
      targetInCompetition: false,
    });
    expect(check).toMatchObject({
      reason: expect.stringContaining("season has started"),
    });
  });
});
