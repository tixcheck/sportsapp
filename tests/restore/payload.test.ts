import { describe, expect, it } from "vitest";

import {
  countResults,
  idsToPrune,
  resolveTeams,
  type SnapshotMatch,
  type SnapshotPayload,
} from "@/lib/restore/payload";

function match(over: Partial<SnapshotMatch> = {}): SnapshotMatch {
  return {
    round: 1,
    court: "Court 1",
    scheduledAt: "2026-09-01T23:00:00.000Z",
    status: "completed",
    homeTeamId: "t1",
    awayTeamId: "t2",
    homeTeamName: "Block Party",
    awayTeamName: "Net Gains",
    refTeamId: null,
    refTeamName: null,
    poolId: null,
    bracketPosition: null,
    bracketTrack: null,
    isAbnormal: false,
    matchFormat: null,
    venueId: null,
    sets: [
      { n: 1, h: 25, a: 19 },
      { n: 2, h: 25, a: 23 },
    ],
    ...over,
  };
}

function payload(matches: SnapshotMatch[]): SnapshotPayload {
  return { version: 1, takenAt: "2026-08-26T10:00:00.000Z", matches };
}

describe("resolveTeams", () => {
  it("maps ids straight through when the teams still exist", () => {
    const r = resolveTeams(payload([match()]), [
      { id: "t1", name: "Block Party" },
      { id: "t2", name: "Net Gains" },
    ]);
    expect(r.mapping.get("t1")).toBe("t1");
    expect(r.mapping.get("t2")).toBe("t2");
    expect(r.missing).toHaveLength(0);
    expect(r.rematchedByName).toHaveLength(0);
  });

  it("falls back to the name when a team was deleted and re-added", () => {
    // The exact case that breaks a naive restore: same team, new row, new id.
    const r = resolveTeams(payload([match()]), [
      { id: "NEW-1", name: "Block Party" },
      { id: "t2", name: "Net Gains" },
    ]);
    expect(r.mapping.get("t1")).toBe("NEW-1");
    expect(r.missing).toHaveLength(0);
    expect(r.rematchedByName).toEqual([
      { name: "Block Party", fromId: "t1", toId: "NEW-1" },
    ]);
  });

  it("ignores case and stray whitespace when matching names", () => {
    const r = resolveTeams(payload([match()]), [
      { id: "NEW-1", name: "  block   party " },
      { id: "t2", name: "Net Gains" },
    ]);
    expect(r.mapping.get("t1")).toBe("NEW-1");
  });

  it("reports a genuinely missing team instead of dropping its games", () => {
    const r = resolveTeams(payload([match()]), [
      { id: "t2", name: "Net Gains" },
    ]);
    expect(r.missing).toEqual([{ id: "t1", name: "Block Party" }]);
    expect(r.mapping.has("t1")).toBe(false);
  });

  it("does not fuzzy-match a similar name", () => {
    // "Block Party B" is a different team. Restoring onto it would corrupt the
    // season more quietly than losing it.
    const r = resolveTeams(payload([match()]), [
      { id: "x", name: "Block Party B" },
      { id: "t2", name: "Net Gains" },
    ]);
    expect(r.missing).toEqual([{ id: "t1", name: "Block Party" }]);
  });

  it("resolves referee teams too", () => {
    const r = resolveTeams(
      payload([match({ refTeamId: "t3", refTeamName: "Side Out" })]),
      [
        { id: "t1", name: "Block Party" },
        { id: "t2", name: "Net Gains" },
        { id: "NEW-3", name: "Side Out" },
      ],
    );
    expect(r.mapping.get("t3")).toBe("NEW-3");
  });

  it("picks the first of two live teams sharing a name, not the last", () => {
    const r = resolveTeams(payload([match()]), [
      { id: "A", name: "Block Party" },
      { id: "B", name: "Block Party" },
      { id: "t2", name: "Net Gains" },
    ]);
    expect(r.mapping.get("t1")).toBe("A");
  });

  it("handles a bye (null team) without inventing a mapping", () => {
    const r = resolveTeams(
      payload([match({ awayTeamId: null, awayTeamName: null })]),
      [{ id: "t1", name: "Block Party" }],
    );
    expect(r.missing).toHaveLength(0);
    expect(r.mapping.size).toBe(1);
  });
});

describe("countResults", () => {
  it("counts matches with sets", () => {
    expect(countResults(payload([match(), match()]))).toBe(2);
  });

  it("counts a forfeit, which has an outcome but no sets", () => {
    expect(
      countResults(payload([match({ status: "forfeit", sets: [] })])),
    ).toBe(1);
  });

  it("does not count an unplayed fixture", () => {
    expect(
      countResults(payload([match({ status: "scheduled", sets: [] })])),
    ).toBe(0);
  });
});

describe("idsToPrune", () => {
  const rows = [
    { id: "a", createdAt: "2026-08-01T00:00:00Z" },
    { id: "b", createdAt: "2026-08-03T00:00:00Z" },
    { id: "c", createdAt: "2026-08-02T00:00:00Z" },
  ];

  it("keeps the newest and drops the rest", () => {
    expect(idsToPrune(rows, 2).sort()).toEqual(["a"]);
  });

  it("drops nothing when under the cap", () => {
    expect(idsToPrune(rows, 10)).toEqual([]);
  });

  it("drops everything when the cap is zero", () => {
    expect(idsToPrune(rows, 0).sort()).toEqual(["a", "b", "c"]);
  });
});
