import { describe, expect, it } from "vitest";

import {
  bvlTemplate,
  combineHalves,
  evenSlotTimes,
  planBvlRound,
  roundWeeksOf,
  type BvlTierWeek,
} from "@/lib/scheduler/bvl-round";

const pairsOf = (teams: number, weekIndexes: number[]) => {
  const t = bvlTemplate(teams)!;
  return weekIndexes.flatMap((w) =>
    t.weeks[w].slots
      .flat()
      .map((g) =>
        [Math.min(g.home, g.away), Math.max(g.home, g.away)].join("-"),
      ),
  );
};
const allPairs = (n: number) => {
  const out: string[] = [];
  for (let a = 1; a <= n; a++)
    for (let b = a + 1; b <= n; b++) out.push(`${a}-${b}`);
  return out;
};
const count = (xs: string[]) =>
  xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());

describe("BVL's grids", () => {
  it("6 teams: the two weeks hold every pairing; 3v5, 2v6, 1v4 twice", () => {
    const c = count(pairsOf(6, [0, 1]));
    expect([...c.keys()].sort()).toEqual(allPairs(6));
    expect(
      [...c.entries()]
        .filter(([, n]) => n === 2)
        .map(([p]) => p)
        .sort(),
    ).toEqual(["1-4", "2-6", "3-5"]);
  });

  it("6 teams: every team plays once a slot, 3 a night, 6 a round", () => {
    const t = bvlTemplate(6)!;
    for (const w of t.weeks) {
      for (const slot of w.slots) {
        expect(slot.flatMap((g) => [g.home, g.away]).sort()).toEqual([
          1, 2, 3, 4, 5, 6,
        ]);
      }
    }
  });

  it("5 teams: each week is a full round robin, OFF is the one not playing", () => {
    const t = bvlTemplate(5)!;
    for (const w of t.weeks) {
      expect(
        [
          ...count(
            w.slots
              .flat()
              .map(
                (g) =>
                  `${Math.min(g.home, g.away)}-${Math.max(g.home, g.away)}`,
              ),
          ).keys(),
        ].sort(),
      ).toEqual(allPairs(5));
      w.slots.forEach((slot, i) => {
        const playing = slot.flatMap((g) => [g.home, g.away]);
        expect(playing).not.toContain(w.off[i]);
        expect([...playing, w.off[i]].sort()).toEqual([1, 2, 3, 4, 5]);
      });
      expect([...w.off].sort()).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it("4 teams: every pairing once a week", () => {
    expect([...count(pairsOf(4, [0])).keys()].sort()).toEqual(allPairs(4));
  });

  it("no grid for 3 or 7", () => {
    expect(bvlTemplate(3)).toBeNull();
    expect(bvlTemplate(7)).toBeNull();
  });
});

describe("roundWeeksOf", () => {
  it("two-week rounds from week 1", () => {
    expect(roundWeeksOf(1, 2)).toEqual([1, 2]);
    expect(roundWeeksOf(2, 2)).toEqual([1, 2]);
    expect(roundWeeksOf(3, 2)).toEqual([3, 4]);
    expect(roundWeeksOf(5, 1)).toEqual([5]);
  });
});

describe("evenSlotTimes", () => {
  it("BVL's 40-minute slots", () => {
    expect(evenSlotTimes("18:15", 40, 3)).toEqual(["18:15", "18:55", "19:35"]);
    expect(evenSlotTimes("19:00", 30, 5)).toEqual([
      "19:00",
      "19:30",
      "20:00",
      "20:30",
      "21:00",
    ]);
  });
});

describe("planBvlRound — Women's Round 1 as on the sheet", () => {
  const B = ["dig", "ace", "what", "appeal", "setsy", "hit"];
  const D = ["hot", "volley", "believe", "indy", "kos"];
  const weeks: { week: number; date: string; tiers: BvlTierWeek[] }[] = [
    {
      week: 1,
      date: "2026-10-14",
      tiers: [
        {
          divisionId: "B",
          teamIds: B,
          venueId: "aquinas",
          slotTimes: ["18:15", "18:55", "19:35"],
        },
        {
          divisionId: "D",
          teamIds: D,
          venueId: "terry",
          slotTimes: evenSlotTimes("19:00", 30, 5),
        },
      ],
    },
    {
      week: 2,
      date: "2026-10-21",
      tiers: [
        {
          divisionId: "B",
          teamIds: B,
          venueId: "campion",
          slotTimes: ["20:10", "20:35", "21:15"],
        },
        {
          divisionId: "D",
          teamIds: D,
          venueId: "terry",
          slotTimes: evenSlotTimes("19:00", 30, 5),
        },
      ],
    },
  ];
  const plan = planBvlRound(weeks);

  it("Oct 14, Aquinas 6:15 court a: Tier B 1v6 — Diggin' v Hit That", () => {
    const f = plan.fixtures.find(
      (x) =>
        x.week === 1 &&
        x.divisionId === "B" &&
        x.time === "18:15" &&
        x.court === "a",
    )!;
    expect([f.homeTeamId, f.awayTeamId]).toEqual(["dig", "hit"]);
    expect(f.venueId).toBe("aquinas");
  });

  it("Oct 21 takes grid B, at the gym that week", () => {
    const f = plan.fixtures.find(
      (x) =>
        x.week === 2 &&
        x.divisionId === "B" &&
        x.time === "21:15" &&
        x.court === "c",
    )!;
    expect([f.homeTeamId, f.awayTeamId]).toEqual(["setsy", "hit"]); // 5v6
    expect(f.venueId).toBe("campion");
  });

  it("game counts: 6-team 18 over the round, 5-team 20; each 6-team side plays 6", () => {
    expect(plan.fixtures.filter((f) => f.divisionId === "B")).toHaveLength(18);
    expect(plan.fixtures.filter((f) => f.divisionId === "D")).toHaveLength(20);
    for (const t of B) {
      expect(
        plan.fixtures.filter((f) => f.homeTeamId === t || f.awayTeamId === t),
      ).toHaveLength(6);
    }
  });

  it("net duty: 6, 4, 3 then 5, 2, 1", () => {
    expect(plan.nets).toEqual([
      { week: 1, divisionId: "B", teamIds: ["hit", "appeal", "what"] },
      { week: 2, divisionId: "B", teamIds: ["setsy", "ace", "dig"] },
    ]);
  });

  it("reports what it can't bind, never guesses", () => {
    const bad = planBvlRound([
      {
        week: 1,
        date: "2026-10-14",
        tiers: [
          {
            divisionId: "X",
            teamIds: ["a", "b", "c"],
            venueId: null,
            slotTimes: ["18:00"],
          },
          {
            divisionId: "Y",
            teamIds: B,
            venueId: null,
            slotTimes: ["18:00", "18:40"],
          },
          {
            divisionId: "Z",
            teamIds: B,
            venueId: null,
            slotTimes: ["18:00", "18:40", "19:20"],
            courtLabels: ["1", "2"],
          },
        ],
      },
    ]);
    expect(bad.fixtures).toHaveLength(0);
    expect(bad.problems.map((p) => p.divisionId)).toEqual(["X", "Y", "Z"]);
  });
});

describe("BVL red games — one game each week, one match together", () => {
  const six = ["s1", "s2", "s3", "s4", "s5", "s6"];
  const plan = planBvlRound(
    [1, 2].map((week) => ({
      week,
      date: week === 1 ? "2026-10-14" : "2026-10-21",
      tiers: [
        {
          divisionId: "B",
          teamIds: six,
          venueId: null,
          slotTimes: ["18:15", "18:55", "19:35"],
        },
        {
          divisionId: "D",
          teamIds: ["d1", "d2", "d3", "d4", "d5"],
          venueId: null,
          slotTimes: evenSlotTimes("19:00", 30, 5),
          courtLabels: ["a", "b"],
        },
      ],
    })),
  );

  it("flags exactly the sheet's red cells: 3v5, 2v6, 1v4, in both weeks", () => {
    const half = plan.fixtures.filter((f) => f.half);
    expect(half).toHaveLength(6);
    expect(half.every((f) => f.divisionId === "B")).toBe(true);
    // Week 1's last slot and week 2's first.
    expect(
      half.filter((f) => f.week === 1).every((f) => f.slotIndex === 2),
    ).toBe(true);
    expect(
      half.filter((f) => f.week === 2).every((f) => f.slotIndex === 0),
    ).toBe(true);
    const pairs = new Set(
      half.map((f) => [f.homeTeamId, f.awayTeamId].sort().join("-")),
    );
    expect([...pairs].sort()).toEqual(["s1-s4", "s2-s6", "s3-s5"]);
  });

  it("each 6-team side then plays all five opponents, once each", () => {
    for (const t of six) {
      const opp = new Set(
        plan.fixtures
          .filter((f) => f.homeTeamId === t || f.awayTeamId === t)
          .map((f) => (f.homeTeamId === t ? f.awayTeamId : f.homeTeamId)),
      );
      expect(opp.size).toBe(5);
    }
  });
});

describe("combineHalves", () => {
  const r = (
    id: string,
    home: string,
    away: string,
    h: number,
    a: number,
    half = true,
  ) => ({
    matchId: id,
    homeTeamId: home,
    awayTeamId: away,
    sets: [{ home: h, away: a }],
    half,
  });

  it("a split pair is one tied match, even when home/away swap between weeks", () => {
    const out = combineHalves([
      r("w1", "A", "B", 25, 20),
      r("w2", "B", "A", 25, 22),
    ]);
    expect(out).toHaveLength(1);
    // Turned to week 1's orientation: A won game 1, B won game 2.
    expect(out[0].sets).toEqual([
      { home: 25, away: 20 },
      { home: 22, away: 25 },
    ]);
  });

  it("2–0 over the two weeks is one win; full matches pass straight through", () => {
    const out = combineHalves([
      r("w1", "A", "B", 25, 20),
      r("full", "A", "C", 25, 10, false),
      r("w2", "A", "B", 25, 18),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((x) => x.matchId === "w1")!.sets).toHaveLength(2);
    expect(out.find((x) => x.matchId === "full")!.sets).toHaveLength(1);
  });

  it("week 1's half alone stays a single game until week 2 is played", () => {
    expect(combineHalves([r("w1", "A", "B", 25, 20)])[0].sets).toHaveLength(1);
  });
});
