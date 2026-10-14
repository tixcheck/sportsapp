import { describe, expect, it } from "vitest";

import {
  SCHEDULE_4_TWO_COURTS,
  SCHEDULE_6_TWO_COURTS,
  SCHEDULE_B,
  rankSession,
  sessionGrid,
  seatTiers,
  suggestTierSizes,
  sessionFixtures,
} from "@/lib/scheduler/alignment";

describe("Schedule B", () => {
  it("is a full round robin of six: 15 games, every pair once, every team every round", () => {
    const pairs = SCHEDULE_B.flat().map(([a, b]) => [a, b].sort().join(""));
    expect(pairs).toHaveLength(15);
    expect(new Set(pairs).size).toBe(15);
    for (const round of SCHEDULE_B) {
      expect(round.flat().sort().join("")).toBe("ABCDEF");
    }
  });

  it("matches BVL's sheet, round by round", () => {
    expect(SCHEDULE_B[0]).toEqual([
      ["A", "F"],
      ["B", "E"],
      ["C", "D"],
    ]);
    expect(SCHEDULE_B[4]).toEqual([
      ["A", "B"],
      ["D", "F"],
      ["C", "E"],
    ]);
  });
});

describe("sessionFixtures", () => {
  it("warm-up then 14-minute rounds on courts a, b, c", () => {
    const f = sessionFixtures();
    expect(f).toHaveLength(15);
    expect(f[0]).toEqual({
      home: "A",
      away: "F",
      court: "a",
      round: 1,
      offsetMinutes: 5,
    });
    expect(f.filter((x) => x.round === 5).map((x) => x.offsetMinutes)).toEqual([
      61, 61, 61,
    ]);
  });
});

describe("sessionGrid", () => {
  const letters = (n: number) => "ABCDEF".slice(0, n).split("");
  const cases: [number, number, number][] = [
    // teams, courts, rounds
    [6, 3, 5],
    [6, 2, 8],
    [5, 2, 5],
    [4, 2, 3],
  ];

  it.each(cases)(
    "%i teams on %i courts: a full round robin in %i rounds, nobody twice in a round",
    (teams, courts, rounds) => {
      const picked = sessionGrid(teams, courts);
      if ("error" in picked) throw new Error(picked.error);
      const grid = picked.grid;
      expect(grid).toHaveLength(rounds);
      const pairs = grid.flat().map(([a, b]) => [a, b].sort().join(""));
      expect(pairs).toHaveLength((teams * (teams - 1)) / 2);
      expect(new Set(pairs).size).toBe(pairs.length);
      for (const p of pairs) {
        for (const l of p) expect(letters(teams)).toContain(l);
      }
      for (const round of grid) {
        expect(round.length).toBeLessThanOrEqual(courts);
        const playing = round.flat();
        expect(new Set(playing).size).toBe(playing.length);
      }
    },
  );

  it("five teams: everyone sits out exactly one round", () => {
    const picked = sessionGrid(5, 2);
    if ("error" in picked) throw new Error(picked.error);
    const sitting = picked.grid.map(
      (round) => letters(5).filter((l) => !round.flat().includes(l))[0],
    );
    expect(sitting.sort()).toEqual(letters(5));
  });

  it("four teams follow BVL's 2-court sheet", () => {
    expect(SCHEDULE_4_TWO_COURTS).toEqual([
      [
        ["A", "B"],
        ["C", "D"],
      ],
      [
        ["A", "C"],
        ["B", "D"],
      ],
      [
        ["A", "D"],
        ["B", "C"],
      ],
    ]);
  });

  it("six on two courts plays Schedule B's games in Schedule B's order", () => {
    expect(SCHEDULE_6_TWO_COURTS.flat()).toEqual(SCHEDULE_B.flat());
  });

  it("refuses a session it has no grid for", () => {
    expect(sessionGrid(3, 2)).toHaveProperty("error");
    expect(sessionGrid(6, 1)).toHaveProperty("error");
  });

  it("sessionFixtures puts a 4-team grid on the courts it's given", () => {
    const f = sessionFixtures({
      teams: 4,
      courts: ["A", "B"],
      warmupMinutes: 10,
      gameMinutes: 16,
    });
    expect(f).toHaveLength(6);
    expect(f.map((x) => x.court)).toEqual(["A", "B", "A", "B", "A", "B"]);
    expect(f[f.length - 1].offsetMinutes).toBe(42);
  });

  it("sessionFixtures throws when there is no grid", () => {
    expect(() => sessionFixtures({ teams: 6, courts: ["1"] })).toThrow();
  });
});

describe("rankSession", () => {
  const seats = ["A", "B", "C", "D", "E", "F"];
  const g = (
    home: string,
    away: string,
    homeScore: number,
    awayScore: number,
  ) => ({
    home,
    away,
    homeScore,
    awayScore,
  });

  it("wins first", () => {
    const order = rankSession(seats, [
      g("A", "F", 10, 20),
      g("B", "E", 20, 10),
    ]);
    expect(order.slice(0, 2)).toEqual(["B", "F"]);
  });

  it("then +/-, each game capped at 15", () => {
    // B and C both 1–0; B won by 30 (counts 15), C by 16 (counts 15) → level on
    // +/-, so seat decides: B before C. Uncapped, B would lead regardless.
    const order = rankSession(seats, [
      g("B", "E", 40, 10),
      g("C", "D", 26, 10),
    ]);
    expect(order.slice(0, 2)).toEqual(["B", "C"]);
    // D lost by 16 → -15, E lost by 30 → -15: level, seat decides.
    expect(order.slice(-2)).toEqual(["D", "E"]);
  });

  it("head to head before +/-", () => {
    // B and C both 1–0 overall would be equal; make them 1–1 with B beating C
    // by 1, while C has the far better overall +/-.
    const order = rankSession(seats, [
      g("B", "C", 11, 10),
      g("C", "D", 25, 10),
      g("E", "B", 25, 10),
    ]);
    // E 1 win; B and C 1 win each — B won their game, so B is above C even
    // though C is +14 overall and B is -14.
    expect(order.indexOf("B")).toBeLessThan(order.indexOf("C"));
  });

  it("three level: the mini-table among them, then its +/-", () => {
    // A, B, C each beat one of the others (a cycle): 1–1 head to head, so
    // head-to-head +/- decides: A +10, B -2, C -8.
    const order = rankSession(seats, [
      g("A", "B", 20, 10),
      g("B", "C", 20, 12),
      g("C", "A", 20, 18),
    ]);
    expect(order.slice(0, 3)).toEqual(["A", "B", "C"]);
  });

  it("then overall +/- when head to head is level too", () => {
    // B and C never met; both 1–0. Overall: C +12, B +3.
    const order = rankSession(seats, [
      g("B", "E", 13, 10),
      g("C", "D", 22, 10),
    ]);
    expect(order.slice(0, 2)).toEqual(["C", "B"]);
  });

  it("a level game is no win for either side", () => {
    const order = rankSession(seats, [g("A", "B", 12, 12)]);
    expect(order).toEqual(seats);
  });
});

describe("seatTiers", () => {
  const ranked = Array.from({ length: 26 }, (_, i) => `t${i + 1}`);

  it("fills tiers top down, seed = overall rank", () => {
    const r = seatTiers(ranked, [4, 6, 6, 6, 4]);
    if ("error" in r) throw new Error(r.error);
    expect(r.tiers.map((t) => t.length)).toEqual([4, 6, 6, 6, 4]);
    expect(r.tiers[0]).toEqual(["t1", "t2", "t3", "t4"]);
    expect(r.tiers[1][0]).toBe("t5");
    expect(r.tiers[4]).toEqual(["t23", "t24", "t25", "t26"]);
    expect(r.seeds.get("t11")).toBe(11);
  });

  it("refuses sizes that don't add up to the ranking", () => {
    expect(seatTiers(ranked, [4, 6, 6, 6])).toEqual({
      error: "The tiers hold 22 teams, but 26 were ranked.",
    });
  });

  it("refuses a tier of one", () => {
    expect("error" in seatTiers(["a", "b", "c"], [2, 1])).toBe(true);
  });
});

describe("suggestTierSizes", () => {
  it("sixes, with fours at the ends when it doesn't divide", () => {
    expect(suggestTierSizes(26)).toEqual([4, 6, 6, 6, 4]);
    expect(suggestTierSizes(24)).toEqual([6, 6, 6, 6]);
    expect(suggestTierSizes(22)).toEqual([6, 6, 6, 4]);
    // Odd: one tier of 5 just above the bottom.
    expect(suggestTierSizes(25)).toEqual([4, 6, 6, 5, 4]);
    for (const n of [5, 7, 9, 13, 17, 23, 31, 53]) {
      const s = suggestTierSizes(n);
      expect(s.reduce((a, b) => a + b, 0)).toBe(n);
      expect(Math.min(...s)).toBeGreaterThanOrEqual(2);
    }
  });
});
