import { describe, expect, it } from "vitest";

import {
  numberedCourts,
  respreadCourts,
  type RespreadGame,
} from "@/lib/scheduler/court-respread";
import type { Court } from "@/lib/scheduler/court-assign";

/** Plain non-prime courts from labels. */
function plain(labels: string[]): Court[] {
  return labels.map((label) => ({ label, prime: false }));
}

/** n games in one wave (same instant), distinct teams per game. */
function wave(at: string, n: number, prefix = "m"): RespreadGame[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    scheduledAt: at,
    homeTeamId: `${prefix}${i}H`,
    awayTeamId: `${prefix}${i}A`,
  }));
}

describe("respreadCourts", () => {
  it("gives every game in a wave a distinct court when courts suffice", () => {
    const res = respreadCourts(
      wave("2026-07-23T23:00:00Z", 7),
      plain(numberedCourts(7)),
    );
    const courts = res.assignments.map((a) => a.court);
    expect(new Set(courts).size).toBe(7);
    expect(res.overCapacityWaves).toBe(0);
    expect(res.maxGamesPerWave).toBe(7);
  });

  it("flags over-capacity when a wave has more games than courts (6 courts, 7 games)", () => {
    const res = respreadCourts(
      wave("2026-07-23T23:00:00Z", 7),
      plain(numberedCourts(6)),
    );
    expect(res.overCapacityWaves).toBe(1);
    expect(res.assignments).toHaveLength(7);
  });

  it("spreads independently within each wave across multiple nights", () => {
    const matches = [
      ...wave("2026-07-23T23:00:00Z", 7, "a"),
      ...wave("2026-07-23T23:45:00Z", 7, "b"),
      ...wave("2026-07-30T23:00:00Z", 7, "c"),
    ];
    const res = respreadCourts(matches, plain(numberedCourts(7)));
    expect(res.waves).toBe(3);
    expect(res.assignments).toHaveLength(21);
    for (const p of ["a", "b", "c"]) {
      const courts = res.assignments
        .filter((x) => x.id.startsWith(p))
        .map((x) => x.court);
      expect(new Set(courts).size).toBe(7);
    }
  });

  it("leaves Time-TBD games (no instant) unassigned", () => {
    const matches: RespreadGame[] = [
      { id: "tbd", scheduledAt: null, homeTeamId: "x", awayTeamId: "y" },
      ...wave("2026-07-23T23:00:00Z", 2),
    ];
    const res = respreadCourts(matches, plain(numberedCourts(7)));
    expect(res.assignments.map((a) => a.id)).not.toContain("tbd");
    expect(res.assignments).toHaveLength(2);
  });

  it("returns nothing when there are no courts", () => {
    const res = respreadCourts(wave("2026-07-23T23:00:00Z", 7), []);
    expect(res.assignments).toHaveLength(0);
  });

  it("balances prime courts across teams, seeded from played games", () => {
    // Custom courts: "P" is prime, "N" is not. Two teams each play once per wave
    // over two waves; team "hot" already banked prime games in the played weeks,
    // so the re-spread should steer prime AWAY from it.
    const courts: Court[] = [
      { label: "P", prime: true },
      { label: "N", prime: false },
    ];
    const games: RespreadGame[] = [
      {
        id: "g1",
        scheduledAt: "2026-07-23T23:00:00Z",
        homeTeamId: "hot",
        awayTeamId: "a",
      },
      {
        id: "g2",
        scheduledAt: "2026-07-23T23:00:00Z",
        homeTeamId: "b",
        awayTeamId: "c",
      },
      {
        id: "g3",
        scheduledAt: "2026-07-30T23:00:00Z",
        homeTeamId: "hot",
        awayTeamId: "b",
      },
      {
        id: "g4",
        scheduledAt: "2026-07-30T23:00:00Z",
        homeTeamId: "a",
        awayTeamId: "c",
      },
    ];
    const seed = new Map([["hot", 5]]); // already had lots of prime
    const res = respreadCourts(games, courts, seed);

    const courtOf = (id: string) =>
      res.assignments.find((a) => a.id === id)!.court;
    // In each wave "hot"'s game should be pushed to the non-prime court.
    expect(courtOf("g1")).toBe("N");
    expect(courtOf("g3")).toBe("N");
  });

  it("groups simultaneous games written in different timestamp formats into one wave", () => {
    // Same instant, two textual forms: zone-offset (generator) and Z (push).
    // They must share a wave and get DISTINCT courts, not the same one.
    const games: RespreadGame[] = [
      {
        id: "a",
        scheduledAt: "2026-07-23T19:00:00.000-04:00",
        homeTeamId: "a1",
        awayTeamId: "a2",
      },
      {
        id: "b",
        scheduledAt: "2026-07-23T23:00:00.000Z", // same instant as above
        homeTeamId: "b1",
        awayTeamId: "b2",
      },
    ];
    const res = respreadCourts(games, plain(numberedCourts(4)));
    expect(res.waves).toBe(1);
    const courts = res.assignments.map((x) => x.court);
    expect(new Set(courts).size).toBe(2); // distinct — no double-book
  });

  it("numberedCourts builds Court 1..N", () => {
    expect(numberedCourts(3)).toEqual(["Court 1", "Court 2", "Court 3"]);
    expect(numberedCourts(0)).toEqual([]);
  });
});
