import { describe, expect, it } from "vitest";

import { splitSeeds } from "@/lib/scheduler/bracket";
import { teamsMissingDrops } from "@/lib/standings/drops";
import { tournamentFormat } from "@/lib/tournament-formats";

describe("splitSeeds", () => {
  const order = Array.from({ length: 15 }, (_, i) => `t${i + 1}`);

  it("splits 8 / 7 over a full 15-team field", () => {
    const { championship, consolation } = splitSeeds(order, 8, 7);
    expect(championship).toEqual([
      "t1",
      "t2",
      "t3",
      "t4",
      "t5",
      "t6",
      "t7",
      "t8",
    ]);
    expect(consolation).toEqual([
      "t9",
      "t10",
      "t11",
      "t12",
      "t13",
      "t14",
      "t15",
    ]);
  });

  it("clamps the consolation list to the teams that remain", () => {
    const short = order.slice(0, 13); // 13 teams, 8/7 requested
    const { championship, consolation } = splitSeeds(short, 8, 7);
    expect(championship).toHaveLength(8);
    expect(consolation).toHaveLength(5); // 13 - 8, not 7
  });

  it("never overlaps the two lists", () => {
    const { championship, consolation } = splitSeeds(order, 8, 7);
    expect(championship.some((id) => consolation.includes(id))).toBe(false);
  });

  it("defaults from the champ_consolation template (8 / 7)", () => {
    const split = tournamentFormat("champ_consolation").split!;
    expect(split).toEqual({ championship: 8, consolation: 7 });
    expect(tournamentFormat("single").split).toBeNull();
  });
});

describe("teamsMissingDrops", () => {
  it("flags only teams in a needs_drop pool with no drop set", () => {
    const missing = teamsMissingDrops([
      { teamId: "a", poolNeedsDrop: true, droppedMatchId: null }, // missing
      { teamId: "b", poolNeedsDrop: true, droppedMatchId: "m1" }, // set
      { teamId: "c", poolNeedsDrop: false, droppedMatchId: null }, // not flagged
    ]);
    expect(missing).toEqual(["a"]);
  });

  it("is empty when no pool needs a drop", () => {
    expect(
      teamsMissingDrops([
        { teamId: "a", poolNeedsDrop: false, droppedMatchId: null },
      ]),
    ).toEqual([]);
  });
});
