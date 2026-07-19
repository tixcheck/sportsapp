import { describe, expect, it } from "vitest";

import {
  numberedCourts,
  respreadCourts,
  type RespreadMatch,
} from "@/lib/scheduler/court-respread";

/** Seven games in one wave (same instant) — the 14-team case. */
function wave(at: string, n: number, prefix = "m"): RespreadMatch[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    scheduledAt: at,
  }));
}

describe("respreadCourts", () => {
  it("gives every game in a wave a distinct court when courts suffice", () => {
    const res = respreadCourts(
      wave("2026-07-23T23:00:00Z", 7),
      numberedCourts(7),
    );
    const courts = res.assignments.map((a) => a.court);
    expect(new Set(courts).size).toBe(7);
    expect(res.overCapacityWaves).toBe(0);
    expect(res.maxGamesPerWave).toBe(7);
  });

  it("flags over-capacity when a wave has more games than courts (6 courts, 7 games)", () => {
    const res = respreadCourts(
      wave("2026-07-23T23:00:00Z", 7),
      numberedCourts(6),
    );
    expect(res.overCapacityWaves).toBe(1);
    // Two games unavoidably share a court until a 7th is added.
    const courts = res.assignments.map((a) => a.court);
    expect(new Set(courts).size).toBe(6);
  });

  it("spreads independently within each wave across multiple nights", () => {
    const matches = [
      ...wave("2026-07-23T23:00:00Z", 7, "a"),
      ...wave("2026-07-23T23:45:00Z", 7, "b"),
      ...wave("2026-07-30T23:00:00Z", 7, "c"),
    ];
    const res = respreadCourts(matches, numberedCourts(7));
    expect(res.waves).toBe(3);
    expect(res.assignments).toHaveLength(21);
    // Each wave uses all 7 courts.
    for (const p of ["a", "b", "c"]) {
      const courts = res.assignments
        .filter((x) => x.id.startsWith(p))
        .map((x) => x.court);
      expect(new Set(courts).size).toBe(7);
    }
  });

  it("leaves Time-TBD games (no instant) unassigned", () => {
    const matches: RespreadMatch[] = [
      { id: "tbd", scheduledAt: null },
      ...wave("2026-07-23T23:00:00Z", 2),
    ];
    const res = respreadCourts(matches, numberedCourts(7));
    expect(res.assignments.map((a) => a.id)).not.toContain("tbd");
    expect(res.assignments).toHaveLength(2);
  });

  it("is deterministic — same games, same assignment", () => {
    const matches = wave("2026-07-23T23:00:00Z", 7);
    expect(respreadCourts(matches, numberedCourts(7))).toEqual(
      respreadCourts([...matches].reverse(), numberedCourts(7)),
    );
  });

  it("returns nothing when there are no courts", () => {
    const res = respreadCourts(wave("2026-07-23T23:00:00Z", 7), []);
    expect(res.assignments).toHaveLength(0);
  });

  it("works with custom court labels", () => {
    const res = respreadCourts(wave("2026-07-23T23:00:00Z", 3), [
      "9",
      "10",
      "11",
    ]);
    expect(res.assignments.map((a) => a.court).sort()).toEqual([
      "10",
      "11",
      "9",
    ]);
  });

  it("numberedCourts builds Court 1..N", () => {
    expect(numberedCourts(3)).toEqual(["Court 1", "Court 2", "Court 3"]);
    expect(numberedCourts(0)).toEqual([]);
  });
});
