import { describe, expect, it } from "vitest";

import { detectConflicts, type SlotMatch } from "@/lib/scheduler/conflicts";

const SLOT = "2026-09-01T19:00:00-04:00";
const OTHER_SLOT = "2026-09-08T19:00:00-04:00";

function m(over: Partial<SlotMatch> & { id: string }): SlotMatch {
  return {
    scheduledAt: SLOT,
    court: "Court 1",
    homeTeamId: null,
    awayTeamId: null,
    ...over,
  };
}

const target = { id: "T", homeTeamId: "A", awayTeamId: "B" };

describe("detectConflicts", () => {
  it("flags a court double-booked in the same slot", () => {
    const c = detectConflicts(target, SLOT, "Court 1", [
      m({ id: "X", court: "Court 1", homeTeamId: "C", awayTeamId: "D" }),
    ]);
    expect(c).toEqual([{ type: "court", matchId: "X" }]);
  });

  it("flags a team playing twice in the same slot", () => {
    const c = detectConflicts(target, SLOT, "Court 2", [
      m({ id: "X", court: "Court 3", homeTeamId: "A", awayTeamId: "D" }),
    ]);
    expect(c).toEqual([{ type: "team", matchId: "X" }]);
  });

  it("flags both court and team when they coincide", () => {
    const c = detectConflicts(target, SLOT, "Court 1", [
      m({ id: "X", court: "Court 1", homeTeamId: "B", awayTeamId: "D" }),
    ]);
    expect(c).toEqual([
      { type: "court", matchId: "X" },
      { type: "team", matchId: "X" },
    ]);
  });

  it("ignores matches in a different slot", () => {
    const c = detectConflicts(target, SLOT, "Court 1", [
      m({
        id: "X",
        scheduledAt: OTHER_SLOT,
        court: "Court 1",
        homeTeamId: "A",
      }),
    ]);
    expect(c).toEqual([]);
  });

  it("ignores the target match itself", () => {
    const c = detectConflicts(target, SLOT, "Court 1", [
      m({ id: "T", court: "Court 1", homeTeamId: "A", awayTeamId: "B" }),
    ]);
    expect(c).toEqual([]);
  });

  it("no conflict for a different court and no shared team", () => {
    const c = detectConflicts(target, SLOT, "Court 1", [
      m({ id: "X", court: "Court 2", homeTeamId: "C", awayTeamId: "D" }),
    ]);
    expect(c).toEqual([]);
  });

  it("skips the court check when court is null but still checks teams", () => {
    const c = detectConflicts(target, SLOT, null, [
      m({ id: "X", court: "Court 1", homeTeamId: "A", awayTeamId: "D" }),
    ]);
    expect(c).toEqual([{ type: "team", matchId: "X" }]);
  });

  it("ignores matches with no scheduled time", () => {
    const c = detectConflicts(target, SLOT, "Court 1", [
      m({ id: "X", scheduledAt: null, court: "Court 1", homeTeamId: "A" }),
    ]);
    expect(c).toEqual([]);
  });

  it("returns nothing for an invalid target time", () => {
    expect(
      detectConflicts(target, "not-a-date", "Court 1", [m({ id: "X" })]),
    ).toEqual([]);
  });

  it("matches the same instant across different offsets/zones", () => {
    // 19:00-04:00 == 23:00Z — same instant expressed differently.
    const c = detectConflicts(target, "2026-09-01T23:00:00Z", "Court 1", [
      m({ id: "X", court: "Court 1", homeTeamId: "C", awayTeamId: "D" }),
    ]);
    expect(c).toEqual([{ type: "court", matchId: "X" }]);
  });
});
