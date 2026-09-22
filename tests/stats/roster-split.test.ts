import { describe, expect, it } from "vitest";

import { identityKey } from "@/lib/stats/attribution";
import { isFullTime, splitFullTime } from "@/lib/stats/roster-split";

const key = (userId: string | null, name: string) =>
  identityKey({ userId, playerName: name });

/** Big Shoots' shape: drafted players have no account, only a typed name. */
const roster = new Set([
  key(null, "David Aitken"),
  key(null, "Brad Morris"),
  key("u-1", "Liam Johnson"),
]);

const player = (name: string, userId: string | null = null) => ({
  userId,
  name,
});

describe("isFullTime", () => {
  it("counts anyone drafted onto a team", () => {
    expect(isFullTime(player("Brad Morris"), roster)).toBe(true);
  });

  it("does not count someone who only ever covered a night", () => {
    expect(isFullTime(player("Wade Sage"), roster)).toBe(false);
  });

  /**
   * The case the rule exists for. David was drafted onto Team 4, missed that
   * night, and turned out as a sub for Team 3 — so every appearance he has is
   * `role: "sub"`. Classifying on how someone played would file a drafted
   * player under subs; the organizer's rule is membership.
   */
  it("keeps a drafted player full-time even when every appearance was as a sub", () => {
    expect(isFullTime(player("David Aitken"), roster)).toBe(true);
  });

  it("matches an account-backed player on their id, not their name", () => {
    // The name shown on the night need not match what they registered under.
    expect(isFullTime(player("L. Johnson", "u-1"), roster)).toBe(true);
    expect(isFullTime(player("Liam Johnson", "u-2"), roster)).toBe(false);
  });

  it("ignores case and stray whitespace, as identityKey does", () => {
    expect(isFullTime(player("  david   aitken "), roster)).toBe(true);
  });

  it("treats an empty roster as nobody being full-time", () => {
    // The stats query turns this into "everyone full-time" before splitting —
    // a league that drafted nobody has no subs either.
    expect(isFullTime(player("Brad Morris"), new Set())).toBe(false);
  });
});

describe("splitFullTime", () => {
  const row = (name: string, fullTime: boolean) => ({ name, fullTime });

  it("separates the two sheets and keeps the incoming order", () => {
    const { fullTime, subs } = splitFullTime([
      row("Wade Sage", false),
      row("David Aitken", true),
      row("Jack Cao", false),
      row("Brad Morris", true),
    ]);
    expect(fullTime.map((r) => r.name)).toEqual([
      "David Aitken",
      "Brad Morris",
    ]);
    expect(subs.map((r) => r.name)).toEqual(["Wade Sage", "Jack Cao"]);
  });

  it("handles a competition nobody has played in", () => {
    expect(splitFullTime([])).toEqual({ fullTime: [], subs: [] });
  });

  it("returns an empty sub sheet when everyone was drafted", () => {
    const { fullTime, subs } = splitFullTime([
      row("David Aitken", true),
      row("Brad Morris", true),
    ]);
    expect(fullTime).toHaveLength(2);
    expect(subs).toEqual([]);
  });
});
