import { describe, expect, it } from "vitest";

import { seedRanks, snakeDraft, type RankedPlayer } from "@/lib/draft/snake";

const LS = "Outside Hitter";
const M = "Middle Blocker";
const RS = "Right Side Hitter";
const S = "Setter";

/** `n` players in a group, ranked 1..n, ids like "LS3". */
function group(position: string, tag: string, n: number): RankedPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${tag}${i + 1}`,
    position,
    rank: i + 1,
  }));
}

describe("snakeDraft", () => {
  /**
   * The organizer wrote this table out himself. It is the specification, so it
   * is asserted literally — every row, every group.
   */
  it("reproduces the organizer's post-playoff table", () => {
    const players = [
      ...group(LS, "LS", 8),
      ...group(M, "M", 8),
      ...group(RS, "RS", 4),
      ...group(S, "S", 4),
    ];

    expect(snakeDraft(players, { teams: 4 })).toEqual([
      ["LS1", "LS8", "M1", "M8", "RS1", "S4"],
      ["LS2", "LS7", "M2", "M7", "RS2", "S3"],
      ["LS3", "LS6", "M3", "M6", "RS3", "S2"],
      ["LS4", "LS5", "M4", "M5", "RS4", "S1"],
    ]);
  });

  it("carries the snake across groups rather than restarting it", () => {
    // The point of the rule: whoever takes the best right side takes the worst
    // setter. Restarting per group would stack team 1 with the best of each.
    const players = [...group(RS, "RS", 4), ...group(S, "S", 4)];
    const teams = snakeDraft(players, { teams: 4 });

    expect(teams[0]).toEqual(["RS1", "S4"]);
    expect(teams[3]).toEqual(["RS4", "S1"]);
  });

  it("balances total rank across teams when a group divides evenly", () => {
    const players = [...group(LS, "LS", 8), ...group(M, "M", 8)];
    const byId = new Map(players.map((p) => [p.id, p.rank!]));

    const totals = snakeDraft(players, { teams: 4 }).map((ids) =>
      ids.reduce((sum, id) => sum + byId.get(id)!, 0),
    );
    // 1+8+1+8 = 18 on every roster.
    expect(totals).toEqual([18, 18, 18, 18]);
  });

  it("handles the real Big Shoots roster: 27 players into 4 teams of 7", () => {
    // 10 outsides, 9 middles, 5 setters, 4 right sides — 28 slots across 27
    // people, since one player is listed at two positions.
    const players = [
      ...group(LS, "LS", 10),
      ...group(M, "M", 9),
      ...group(RS, "RS", 4),
      ...group(S, "S", 5),
    ];

    const teams = snakeDraft(players, { teams: 4 });

    // Everyone drafted exactly once.
    const all = teams.flat();
    expect(all).toHaveLength(28);
    expect(new Set(all).size).toBe(28);

    expect(teams.map((t) => t.length)).toEqual([7, 7, 7, 7]);

    /**
     * The rule assumes group sizes that divide by the team count — the
     * organizer's own table is 8/8/4/4. This roster is 10/9/4/5, so the snake
     * arrives at the right sides mid-turn and team 1 gets none of the four,
     * taking a second setter instead.
     *
     * That is the rule working, not failing, and it is asserted here so the
     * consequence is recorded rather than discovered on draft night. The board
     * shows each team's position breakdown, so the organizer sees the hole and
     * drags one across.
     */
    expect(teams[0].filter((id) => id.startsWith("RS"))).toEqual([]);
    expect(teams[0].filter((id) => /^S\d/.test(id))).toEqual(["S1", "S2"]);
    expect(teams[3].filter((id) => id.startsWith("RS"))).toEqual([
      "RS1",
      "RS2",
    ]);

    // Everyone does still get a setter.
    for (const t of teams) {
      expect(t.some((id) => /^S\d/.test(id))).toBe(true);
    }
  });

  it("keeps unranked players in list order", () => {
    const players: RankedPlayer[] = [
      { id: "a", position: S },
      { id: "b", position: S },
      { id: "c", position: S },
      { id: "d", position: S },
    ];
    expect(snakeDraft(players, { teams: 4 })).toEqual([
      ["a"],
      ["b"],
      ["c"],
      ["d"],
    ]);
  });

  it("drafts unexpected positions rather than dropping them", () => {
    const players: RankedPlayer[] = [
      { id: "s1", position: S, rank: 1 },
      { id: "x1", position: "Beach Specialist", rank: 1 },
      { id: "x2", position: "Beach Specialist", rank: 2 },
    ];
    const teams = snakeDraft(players, { teams: 2 });
    expect(teams.flat().sort()).toEqual(["s1", "x1", "x2"]);
  });

  it("returns empty rosters for degenerate inputs", () => {
    expect(snakeDraft([], { teams: 4 })).toEqual([[], [], [], []]);
    expect(snakeDraft([{ id: "a", position: S }], { teams: 0 })).toEqual([]);
  });
});

describe("seedRanks", () => {
  it("numbers each position group from one, in list order", () => {
    const ranks = seedRanks([
      { id: "a", position: LS },
      { id: "b", position: S },
      { id: "c", position: LS },
      { id: "d", position: S },
      { id: "e", position: LS },
    ]);
    expect([...ranks]).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 2],
      ["d", 2],
      ["e", 3],
    ]);
  });
});
