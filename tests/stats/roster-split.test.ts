import { describe, expect, it } from "vitest";

import { identityKey } from "@/lib/stats/attribution";
import {
  isFullTime,
  rosterKeys,
  splitFullTime,
} from "@/lib/stats/roster-split";

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

describe("rosterKeys", () => {
  it("keys somebody with an account BOTH ways", () => {
    const keys = rosterKeys([{ userId: "u-1", name: "Stefan Salo" }]);
    expect([...keys].sort()).toEqual(["n:stefan salo", "u:u-1"]);
  });

  it("keys a drafted player with no account by name alone", () => {
    expect([...rosterKeys([{ userId: null, name: "David Aitken" }])]).toEqual([
      "n:david aitken",
    ]);
  });

  /**
   * The bug this exists for. The lineup UI records `user_id` only when it
   * happens to know the account — Big Shoots had 3 appearance rows keyed to an
   * account and 69 by name. So the stats row for a drafted player arrives as
   * `n:stefan salo` while the roster knows him as `u:c078588b…`, the membership
   * test says no, and a drafted player is filed under Subs. Ten of Big Shoots'
   * players sat in the wrong table, four of them with absences recorded — which
   * only a rostered player can have, so the data contradicted itself.
   */
  it("makes a name-keyed lineup row match its account-backed roster entry", () => {
    const keys = rosterKeys([{ userId: "u-1", name: "Stefan Salo" }]);
    expect(isFullTime({ userId: null, name: "Stefan Salo" }, keys)).toBe(true);
  });

  /**
   * The alias must not become "match anything with this name". An appearance
   * that DOES name an account is a positive statement about which person it
   * was, and a different account with the same display name is a different
   * person — Big Shoots has two "Adam Burgess" and two "Sean Gade".
   */
  it("still refuses a different account that shares the name", () => {
    const keys = rosterKeys([{ userId: "u-1", name: "Adam Burgess" }]);
    expect(isFullTime({ userId: "u-2", name: "Adam Burgess" }, keys)).toBe(
      false,
    );
  });

  it("normalises the name alias the way identityKey does", () => {
    const keys = rosterKeys([{ userId: "u-1", name: "  STEFAN   salo " }]);
    expect(isFullTime({ userId: null, name: "Stefan Salo" }, keys)).toBe(true);
  });

  it("skips a missing name rather than keying an empty one", () => {
    // `n:` would match every unnamed row in the competition at once.
    const keys = rosterKeys([
      { userId: "u-1", name: null },
      { userId: null, name: "   " },
    ]);
    expect([...keys]).toEqual(["u:u-1"]);
  });

  it("returns nothing for a competition that drafted nobody", () => {
    expect([...rosterKeys([])]).toEqual([]);
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
