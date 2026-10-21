import { describe, expect, it } from "vitest";

import {
  bvlCycle,
  bvlTemplate,
  combineHalves,
  evenSlotTimes,
  gridStyleOf,
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

  it("a double-defaulted half adds nothing; the played half decides the match", () => {
    const dd = { ...r("w1", "A", "B", 0, 0), sets: [], doubleDefault: true };
    const out = combineHalves([dd, r("w2", "B", "A", 25, 22)]);
    expect(out).toHaveLength(1);
    expect(out[0].doubleDefault).toBe(false);
    expect(out[0].sets).toEqual([{ home: 22, away: 25 }]);
  });

  it("both halves double-defaulted is still a double default", () => {
    const dd = (id: string) => ({
      ...r(id, "A", "B", 0, 0),
      sets: [],
      doubleDefault: true,
    });
    const out = combineHalves([dd("w1"), dd("w2")]);
    expect(out[0].doubleDefault).toBe(true);
    expect(out[0].sets).toEqual([]);
  });
});

describe("Reverse 4s grid — 6-team tiers play everyone once (3 slots, then 2)", () => {
  const t = bvlTemplate(6, "once")!;
  it("15 pairings, each exactly once, every team in every slot", () => {
    const pairs = t.weeks.flatMap((w) =>
      w.slots
        .flat()
        .map((g) => `${Math.min(g.home, g.away)}-${Math.max(g.home, g.away)}`),
    );
    expect(pairs).toHaveLength(15);
    expect(new Set(pairs).size).toBe(15);
    for (const w of t.weeks)
      for (const slot of w.slots)
        expect(slot.flatMap((g) => [g.home, g.away]).sort()).toEqual([
          1, 2, 3, 4, 5, 6,
        ]);
  });
  it("week 1 is a triple, week 2 a double; no red halves", () => {
    expect(t.weeks.map((w) => w.slots.length)).toEqual([3, 2]);
    expect(t.halfPairs).toEqual([]);
  });
  it("4- and 5-team grids don't change with the style", () => {
    expect(bvlTemplate(4, "once")).toBe(bvlTemplate(4));
    expect(bvlTemplate(5, "once")).toBe(bvlTemplate(5));
    expect(bvlTemplate(6)).not.toBe(t);
  });
  it("planBvlRound uses it when asked: 15 games, none half", () => {
    const six = ["a", "b", "c", "d", "e", "f"];
    const plan = planBvlRound(
      [1, 2].map((week) => ({
        week,
        date: `2026-10-${week === 1 ? 13 : 20}`,
        tiers: [
          {
            divisionId: "B",
            teamIds: six,
            venueId: null,
            slotTimes: ["18:30", "19:10", "19:50"],
          },
        ],
      })),
      "once",
    );
    expect(plan.problems).toEqual([]);
    expect(plan.fixtures).toHaveLength(15);
    expect(plan.fixtures.some((f) => f.half)).toBe(false);
  });
});

describe("Non-Spiking cycle — a rotation played straight through a 4-week round", () => {
  const pair = (a: string, b: string) => [a, b].sort().join("-");
  const tier = (id: string, teams: string[], slots: number): BvlTierWeek => ({
    divisionId: id,
    teamIds: teams,
    venueId: null,
    slotTimes: Array.from({ length: slots }, (_, i) => `20:${i}0`),
  });
  const six = ["t1", "t2", "t3", "t4", "t5", "t6"];
  const seven = [...six, "t7"];
  // Indru's Round 1 sheet: Division A gets 3, 2, 3, 2 rounds over the four Tuesdays.
  const round = (teams: string[], slots: number[]) =>
    planBvlRound(
      slots.map((n, i) => ({
        week: i + 1,
        date: `2026-1${i}-01`,
        tiers: [tier("X", teams, n)],
      })),
      "cycle",
    );

  it("both rotations: every team once per round (one sits out of 7), every pairing once a cycle", () => {
    for (const n of [6, 7]) {
      const cycle = bvlCycle(n)!;
      expect(cycle).toHaveLength(n === 6 ? 5 : 7);
      const pairs = new Set<string>();
      for (const r of cycle) {
        const playing = r.flatMap((g) => [g.home, g.away]);
        expect(r).toHaveLength(3);
        expect(new Set(playing).size).toBe(6);
        r.forEach((g) => pairs.add(pair(String(g.home), String(g.away))));
      }
      expect(pairs.size).toBe((n * (n - 1)) / 2);
    }
    expect(bvlCycle(5)).toBeNull();
  });

  it("carries on where last week stopped: 3+2+3+2 slots = two full round robins for 6", () => {
    const plan = round(six, [3, 2, 3, 2]);
    expect(plan.problems).toEqual([]);
    expect(plan.fixtures).toHaveLength(30);
    const n = new Map<string, number>();
    for (const f of plan.fixtures) {
      const k = pair(f.homeTeamId, f.awayTeamId);
      n.set(k, (n.get(k) ?? 0) + 1);
    }
    expect(n.size).toBe(15);
    expect([...n.values()].every((c) => c === 2)).toBe(true);
    // Week 2 opens on rotation round 4 (1v3), not round 1 again.
    const wk2 = plan.fixtures.filter((f) => f.week === 2);
    expect(pair(wk2[0].homeTeamId, wk2[0].awayTeamId)).toBe("t1-t3");
  });

  it("7 teams: one team off every slot, matches split 9/8 over 10 rounds", () => {
    const plan = round(seven, [3, 3, 2, 2]);
    expect(plan.problems).toEqual([]);
    expect(plan.fixtures).toHaveLength(30);
    const games = new Map<string, number>();
    for (const f of plan.fixtures)
      for (const t of [f.homeTeamId, f.awayTeamId])
        games.set(t, (games.get(t) ?? 0) + 1);
    expect([...games.values()].sort()).toEqual([8, 8, 8, 9, 9, 9, 9]);
  });

  it("each slot takes the gym's time and courts a, b, c; no halves, no nets", () => {
    const plan = round(six, [3]);
    expect(plan.fixtures.map((f) => f.time)).toEqual([
      "20:00",
      "20:00",
      "20:00",
      "20:10",
      "20:10",
      "20:10",
      "20:20",
      "20:20",
      "20:20",
    ]);
    expect(plan.fixtures.slice(0, 3).map((f) => f.court)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(plan.fixtures.some((f) => f.half)).toBe(false);
    expect(plan.nets).toEqual([]);
    expect(bvlTemplate(6, "cycle")).toBeNull();
  });

  it("reports what it can't bind, never guesses", () => {
    const five = planBvlRound(
      [{ week: 1, date: "2026-10-20", tiers: [tier("X", six.slice(0, 5), 2)] }],
      "cycle",
    );
    expect(five.problems[0].reason).toMatch(/6 or 7/);
    const noTimes = planBvlRound(
      [{ week: 1, date: "2026-10-20", tiers: [tier("X", six, 0)] }],
      "cycle",
    );
    expect(noTimes.problems[0].reason).toMatch(/no slot times/);
    const twoCourts = planBvlRound(
      [
        {
          week: 1,
          date: "2026-10-20",
          tiers: [{ ...tier("X", six, 2), courtLabels: ["a", "b"] }],
        },
      ],
      "cycle",
    );
    expect(twoCourts.problems[0].reason).toMatch(/3 courts/);
  });

  it("gridStyleOf reads the stored setting; unknown is the Women's grid", () => {
    expect(gridStyleOf("cycle")).toBe("cycle");
    expect(gridStyleOf("once")).toBe("once");
    expect(gridStyleOf(null)).toBe("bvl");
    expect(gridStyleOf("nonsense")).toBe("bvl");
  });
});
