import { describe, expect, it } from "vitest";

import {
  SCHEDULE_B,
  rankSession,
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
    for (const n of [5, 7, 9, 13, 17, 23, 31, 53]) {
      const s = suggestTierSizes(n);
      expect(s.reduce((a, b) => a + b, 0)).toBe(n);
      expect(Math.min(...s)).toBeGreaterThanOrEqual(2);
    }
  });
});
