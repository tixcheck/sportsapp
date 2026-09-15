import { describe, expect, it } from "vitest";

import {
  buildPartnerGrid,
  neverTogetherForPool,
  pairKey,
  type GridPlayer,
} from "@/lib/stats/partner-grid";
import { partnershipCounts, type Appearance } from "@/lib/stats/attribution";

const p = (name: string): GridPlayer => ({
  key: `n:${name.toLowerCase()}`,
  name,
});
const JAMIE = p("Jamie Orth");
const LIAM = p("Liam Johnson");
const ROWAN = p("Rowan Adam");
const STEFAN = p("Stefan Salo");

describe("pairKey", () => {
  it("files a pair the same way whichever order it is asked in", () => {
    expect(pairKey("n:b", "n:a")).toBe(pairKey("n:a", "n:b"));
  });

  // The grid is only correct if its lookups use the exact key
  // partnershipCounts writes.
  it("matches the key partnershipCounts writes", () => {
    const appear = (name: string): Appearance => ({
      matchId: "m1",
      teamId: "t1",
      userId: null,
      playerName: name,
      role: "rostered",
    });
    const counts = partnershipCounts(
      [appear("Liam Johnson"), appear("Jamie Orth")],
      new Map([["m1", "2026-09-18"]]),
    );
    expect(counts.get(pairKey(LIAM.key, JAMIE.key))).toBe(1);
  });
});

describe("buildPartnerGrid", () => {
  const counts = new Map([
    [pairKey(JAMIE.key, LIAM.key), 2],
    [pairKey(JAMIE.key, ROWAN.key), 1],
  ]);
  const grid = buildPartnerGrid([ROWAN, LIAM, JAMIE], counts);

  it("orders players alphabetically", () => {
    expect(grid.players.map((x) => x.name)).toEqual([
      "Jamie Orth",
      "Liam Johnson",
      "Rowan Adam",
    ]);
  });

  it("is symmetric with an empty diagonal", () => {
    expect(grid.counts).toEqual([
      [0, 2, 1],
      [2, 0, 0],
      [1, 0, 0],
    ]);
  });

  it("lists the pairs that have never happened", () => {
    expect(grid.neverTogether).toEqual([{ a: LIAM, b: ROWAN }]);
  });

  it("lists repeats, most first, and reports the maximum", () => {
    expect(grid.repeats).toEqual([{ a: JAMIE, b: LIAM, nights: 2 }]);
    expect(grid.max).toBe(2);
  });

  it("collapses a player given twice", () => {
    expect(buildPartnerGrid([JAMIE, JAMIE], new Map()).players).toEqual([
      JAMIE,
    ]);
  });

  it("is empty for nobody", () => {
    expect(buildPartnerGrid([], new Map())).toEqual({
      players: [],
      counts: [],
      neverTogether: [],
      repeats: [],
      max: 0,
    });
  });
});

describe("neverTogetherForPool", () => {
  const grid = buildPartnerGrid(
    [JAMIE, LIAM, ROWAN],
    new Map([[pairKey(JAMIE.key, LIAM.key), 1]]),
  );

  it("lists, per pool player, who in the pool they haven't played with", () => {
    const { entries } = neverTogetherForPool(grid, [JAMIE, LIAM, ROWAN]);
    expect(entries).toEqual([
      { player: ROWAN, never: [JAMIE, LIAM] },
      { player: JAMIE, never: [ROWAN] },
      { player: LIAM, never: [ROWAN] },
    ]);
  });

  // Somebody new has "never played with" everyone — true, and noise. They are
  // named once, not repeated on every other player's line.
  it("keeps players who haven't played yet out of every line", () => {
    const { entries, newcomers } = neverTogetherForPool(grid, [
      JAMIE,
      LIAM,
      STEFAN,
    ]);
    expect(newcomers).toEqual([STEFAN]);
    expect(entries.flatMap((e) => e.never)).not.toContainEqual(STEFAN);
  });

  it("only compares players inside the pool", () => {
    const { entries } = neverTogetherForPool(grid, [JAMIE, LIAM]);
    expect(entries).toEqual([]);
  });

  it("de-duplicates the pool", () => {
    const { newcomers } = neverTogetherForPool(grid, [STEFAN, STEFAN]);
    expect(newcomers).toEqual([STEFAN]);
  });
});
