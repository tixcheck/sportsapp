import { describe, expect, it } from "vitest";

import { pairNightsForPool, teamRepeats } from "@/lib/draft/repeats";
import { buildPartnerGrid, pairKey } from "@/lib/stats/partner-grid";

const players = [
  { key: "u:a", name: "Alex" },
  { key: "u:b", name: "Brad" },
  { key: "u:c", name: "Cam" },
  { key: "n:dee", name: "Dee" },
];
const grid = buildPartnerGrid(
  players,
  new Map([
    [pairKey("u:a", "u:b"), 3],
    [pairKey("u:a", "u:c"), 1],
  ]),
);
const pool = [
  { id: "fa-a", key: "u:a" },
  { id: "fa-b", key: "u:b" },
  { id: "fa-c", key: "u:c" },
  { id: "fa-d", key: "n:dee" },
  // Drafted but never played: in no lineup, so no pairs.
  { id: "fa-new", key: "n:newcomer" },
];

describe("pairNightsForPool", () => {
  it("re-keys the grid by pool id, both ways, and drops pairs never together", () => {
    const n = pairNightsForPool(grid, pool);
    expect(n["fa-a"]).toEqual({ "fa-b": 3, "fa-c": 1 });
    expect(n["fa-b"]).toEqual({ "fa-a": 3 });
    expect(n["fa-d"]).toBeUndefined();
    expect(n["fa-new"]).toBeUndefined();
  });
});

describe("teamRepeats", () => {
  const nights = pairNightsForPool(grid, pool);

  it("counts the pairs on a team who've played together, and who with", () => {
    const r = teamRepeats(["fa-a", "fa-b", "fa-c", "fa-d"], nights);
    expect(r.pairs).toBe(2);
    expect(r.byPlayer["fa-a"]).toEqual([
      { id: "fa-b", nights: 3 },
      { id: "fa-c", nights: 1 },
    ]);
    expect(r.byPlayer["fa-d"]).toBeUndefined();
  });

  it("a team of people who've never played together has none", () => {
    expect(teamRepeats(["fa-b", "fa-c", "fa-d", "fa-new"], nights).pairs).toBe(
      0,
    );
  });
});
