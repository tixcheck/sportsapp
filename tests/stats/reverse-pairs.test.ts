import { describe, expect, it } from "vitest";

import {
  partnerMatrix,
  reversePairsStandings,
  type ReversePairsGameResult,
} from "@/lib/stats/reverse-pairs";

const game = (
  sideA: string[],
  scoreA: number | null,
  scoreB: number | null,
  sideB: string[],
): ReversePairsGameResult => ({ sideA, sideB, scoreA, scoreB });

describe("reversePairsStandings", () => {
  /**
   * The margin goes to every pair on the side. This is the organizer's own
   * scoring: his game 1 finished 22-25, and all three losers were marked -3
   * while all three winners took +3.
   */
  it("gives every pair on a side the game's margin", () => {
    const rows = reversePairsStandings(
      ["a", "b", "c", "d", "e", "f"],
      [game(["a", "b", "c"], 22, 25, ["d", "e", "f"])],
    );
    const by = new Map(rows.map((r) => [r.teamId, r]));

    for (const id of ["a", "b", "c"]) {
      expect(by.get(id)!.differential).toBe(-3);
      expect(by.get(id)!.lost).toBe(1);
    }
    for (const id of ["d", "e", "f"]) {
      expect(by.get(id)!.differential).toBe(3);
      expect(by.get(id)!.won).toBe(1);
    }
  });

  it("sums differentials across games and ranks on the total", () => {
    const rows = reversePairsStandings(
      ["a", "b", "c", "d", "e", "f"],
      [
        game(["a", "b", "c"], 25, 20, ["d", "e", "f"]),
        game(["a", "e", "f"], 18, 25, ["b", "c", "d"]),
      ],
    );
    const by = new Map(rows.map((r) => [r.teamId, r]));

    expect(by.get("a")!.differential).toBe(5 - 7); // won by 5, lost by 7
    expect(by.get("b")!.differential).toBe(5 + 7);
    expect(by.get("d")!.differential).toBe(-5 + 7);
    expect(rows[0].teamId).toBe("b"); // +12, best in the field
  });

  it("counts points for and against, not just the margin", () => {
    const rows = reversePairsStandings(
      ["a", "b", "c", "d", "e", "f"],
      [game(["a", "b", "c"], 25, 20, ["d", "e", "f"])],
    );
    const a = rows.find((r) => r.teamId === "a")!;
    expect(a.pointsFor).toBe(25);
    expect(a.pointsAgainst).toBe(20);
    expect(a.played).toBe(1);
  });

  it("ignores games with no score yet", () => {
    const rows = reversePairsStandings(
      ["a", "b", "c", "d", "e", "f"],
      [
        game(["a", "b", "c"], null, null, ["d", "e", "f"]),
        game(["a", "b", "c"], 25, 20, ["d", "e", "f"]),
      ],
    );
    expect(rows.find((r) => r.teamId === "a")!.played).toBe(1);
  });

  it("lists pairs who haven't played, rather than dropping them", () => {
    const rows = reversePairsStandings(["a", "b", "c", "d", "e", "f", "z"], []);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.played === 0 && r.differential === 0)).toBe(
      true,
    );
    // Everyone level, so everyone is first.
    expect(rows.every((r) => r.rank === 1)).toBe(true);
  });

  it("shares a rank on a tie and skips the next, as in athletics", () => {
    const rows = reversePairsStandings(
      ["a", "b", "c", "d", "e", "f"],
      [
        game(["a", "b", "c"], 25, 20, ["d", "e", "f"]),
        game(["a", "d", "e"], 25, 24, ["b", "c", "f"]),
      ],
    );
    // a: +5+1 = 6; b,c: +5-1 = 4; d,e: -5+1 = -4; f: -5-1 = -6
    expect(rows.map((r) => [r.teamId, r.differential, r.rank])).toEqual([
      ["a", 6, 1],
      ["b", 4, 2],
      ["c", 4, 2],
      ["d", -4, 4],
      ["e", -4, 4],
      ["f", -6, 6],
    ]);
  });

  /**
   * The organizer's sheet is a column per game, then a total — the per-game
   * numbers are how a player checks their own night, so they carry the same
   * weight as the ranking.
   */
  it("records the margin from each of a pair's own games, in order", () => {
    const rows = reversePairsStandings(
      ["a", "b", "c", "d", "e", "f"],
      [
        game(["a", "b", "c"], 25, 20, ["d", "e", "f"]),
        game(["a", "d", "e"], 18, 25, ["b", "c", "f"]),
        game(["a", "b", "f"], 25, 24, ["c", "d", "e"]),
      ],
    );
    const by = new Map(rows.map((r) => [r.teamId, r]));

    expect(by.get("a")!.perGame).toEqual([5, -7, 1]);
    expect(by.get("f")!.perGame).toEqual([-5, 7, 1]);
    // The totals stay the sum of the columns.
    expect(by.get("a")!.differential).toBe(-1);
    expect(by.get("f")!.differential).toBe(3);
  });

  it("counts only a pair's own games, leaving no gap for a bye", () => {
    // "e" sits out the middle game entirely, so their second column is their
    // second GAME, not the second round.
    const rows = reversePairsStandings(
      ["a", "b", "c", "d", "e", "f", "g", "h"],
      [
        game(["a", "b", "e"], 25, 20, ["c", "d", "f"]),
        game(["a", "b", "c"], 21, 25, ["d", "f", "g"]),
        game(["a", "e", "h"], 25, 23, ["b", "c", "d"]),
      ],
    );
    const by = new Map(rows.map((r) => [r.teamId, r]));

    expect(by.get("e")!.perGame).toEqual([5, 2]);
    expect(by.get("e")!.played).toBe(2);
    expect(by.get("a")!.perGame).toEqual([5, -4, 2]);
    expect(by.get("g")!.perGame).toEqual([4]);
  });

  it("holds a column open for a game that isn't scored yet", () => {
    // Skipping it would shift later games left and renumber them mid-night.
    const rows = reversePairsStandings(
      ["a", "b", "c", "d", "e", "f"],
      [
        game(["a", "b", "c"], 25, 20, ["d", "e", "f"]),
        game(["a", "b", "c"], null, null, ["d", "e", "f"]),
        game(["a", "b", "c"], 25, 24, ["d", "e", "f"]),
      ],
    );
    const a = rows.find((r) => r.teamId === "a")!;
    expect(a.perGame).toEqual([5, null, 1]);
    expect(a.played).toBe(2);
    expect(a.differential).toBe(6);
  });

  it("keeps a result for a pair not in the given list", () => {
    // Dropping them would silently lose a played game.
    const rows = reversePairsStandings(
      ["a"],
      [game(["a", "b", "c"], 25, 20, ["d", "e", "f"])],
    );
    expect(rows).toHaveLength(6);
  });
});

describe("reversePairsStandings with a point cap", () => {
  /**
   * Timed games, so a score can be 35-20. Theresa's rule: "10 points max per
   * game" — the margin that counts, not the score itself.
   */
  it("caps the margin a single game contributes", () => {
    const rows = reversePairsStandings(
      ["a", "b", "c", "d", "e", "f"],
      [game(["a", "b", "c"], 35, 20, ["d", "e", "f"])],
      { pointCap: 10 },
    );
    const by = new Map(rows.map((r) => [r.teamId, r]));
    expect(by.get("a")!.differential).toBe(10); // +15 raw
    expect(by.get("d")!.differential).toBe(-10);
  });

  it("leaves a margin inside the cap alone", () => {
    const rows = reversePairsStandings(
      ["a", "b", "c", "d", "e", "f"],
      [game(["a", "b", "c"], 25, 22, ["d", "e", "f"])],
      { pointCap: 10 },
    );
    expect(rows.find((r) => r.teamId === "a")!.differential).toBe(3);
  });

  it("keeps points for and against RAW — they are what was scored", () => {
    const rows = reversePairsStandings(
      ["a", "b", "c", "d", "e", "f"],
      [game(["a", "b", "c"], 35, 20, ["d", "e", "f"])],
      { pointCap: 10 },
    );
    const a = rows.find((r) => r.teamId === "a")!;
    expect(a.pointsFor).toBe(35);
    expect(a.pointsAgainst).toBe(20);
    // A win is a win at any margin.
    expect(a.won).toBe(1);
  });

  it("caps each game separately, not the total", () => {
    // Two +15 wins are +20 capped, not capped at 10 overall.
    const rows = reversePairsStandings(
      ["a", "b", "c", "d", "e", "f"],
      [
        game(["a", "b", "c"], 35, 20, ["d", "e", "f"]),
        game(["a", "b", "c"], 35, 20, ["d", "e", "f"]),
      ],
      { pointCap: 10 },
    );
    expect(rows.find((r) => r.teamId === "a")!.differential).toBe(20);
  });

  it("shows the capped margin in the per-game columns too", () => {
    // The sheet has to add up: the columns must sum to the total.
    const rows = reversePairsStandings(
      ["a", "b", "c", "d", "e", "f"],
      [
        game(["a", "b", "c"], 35, 20, ["d", "e", "f"]),
        game(["a", "b", "c"], 22, 25, ["d", "e", "f"]),
      ],
      { pointCap: 10 },
    );
    const a = rows.find((r) => r.teamId === "a")!;
    expect(a.perGame).toEqual([10, -3]);
    expect(a.differential).toBe(7);
  });

  it("is uncapped when no cap is given — every existing night is unchanged", () => {
    const rows = reversePairsStandings(
      ["a", "b", "c", "d", "e", "f"],
      [game(["a", "b", "c"], 35, 20, ["d", "e", "f"])],
    );
    expect(rows.find((r) => r.teamId === "a")!.differential).toBe(15);
  });

  it("treats an explicit null as uncapped", () => {
    const rows = reversePairsStandings(
      ["a", "b", "c", "d", "e", "f"],
      [game(["a", "b", "c"], 35, 20, ["d", "e", "f"])],
      { pointCap: null },
    );
    expect(rows.find((r) => r.teamId === "a")!.differential).toBe(15);
  });

  it("reorders the field when a blowout stops dominating", () => {
    // The whole point of the cap, as a table. The same six pairs all night:
    // a/b/c win one massacre, then lose three close ones to d/e/f.
    //
    //   raw     a,b,c: +30 -8 -7 -7 = +8   d,e,f: -30 +8 +7 +7 = -8
    //   capped  a,b,c: +10 -8 -7 -7 = -12  d,e,f: -10 +8 +7 +7 = +12
    //
    // Uncapped, one blowout outweighs three defeats and a/b/c top the night.
    // Capped, the pairs who actually won three games do.
    const ids = ["a", "b", "c", "d", "e", "f"];
    const games = [
      game(["a", "b", "c"], 40, 10, ["d", "e", "f"]),
      game(["d", "e", "f"], 25, 17, ["a", "b", "c"]),
      game(["d", "e", "f"], 25, 18, ["a", "b", "c"]),
      game(["d", "e", "f"], 25, 18, ["a", "b", "c"]),
    ];

    const raw = reversePairsStandings(ids, games);
    expect(raw[0].teamId).toBe("a");
    expect(raw[0].differential).toBe(8);

    const capped = reversePairsStandings(ids, games, { pointCap: 10 });
    expect(capped[0].teamId).toBe("d");
    expect(capped[0].differential).toBe(12);
    expect(capped.find((r) => r.teamId === "a")!.differential).toBe(-12);
    // Three wins stay three wins — the cap never touches the W/L column.
    expect(capped.find((r) => r.teamId === "d")!.won).toBe(3);
  });
});

describe("reversePairsStandings ranked by wins, then points %", () => {
  it("puts more wins above a better percentage", () => {
    // a: 2 wins, both by a point, and a heavy loss: 60 for, 73 against.
    // b: 1 win, a blowout: 49 for, 35 against. c: 1 win: 59 for, 60 against.
    const rows = reversePairsStandings(
      ["a", "b", "c"],
      [
        game(["a"], 25, 24, ["b"]),
        game(["a"], 25, 24, ["c"]),
        game(["b"], 25, 10, ["c"]),
        game(["c"], 25, 10, ["a"]),
      ],
      { ranking: "wins_pct" },
    );
    expect(rows.map((r) => r.teamId)).toEqual(["a", "b", "c"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows[0].pointPct).toBeCloseTo(60 / 133);
    expect(rows[1].pointPct).toBeCloseTo(49 / 84);
  });

  it("adds a bonus to points for, once, and it can break a tie", () => {
    const plain = reversePairsStandings(
      ["a", "b"],
      [game(["a"], 25, 20, ["x"]), game(["b"], 25, 20, ["y"])],
      { ranking: "wins_pct" },
    );
    // Same record and points: they share first (x and y are below).
    expect(plain.slice(0, 2).map((r) => r.rank)).toEqual([1, 1]);

    const rows = reversePairsStandings(
      ["a", "b"],
      [game(["a"], 25, 20, ["x"]), game(["b"], 25, 20, ["y"])],
      { ranking: "wins_pct", bonus: { b: 6 } },
    );
    expect(rows[0].teamId).toBe("b");
    expect(rows[0].bonus).toBe(6);
    expect(rows[0].pointPct).toBeCloseTo(31 / 51);
    // Raw points stay raw: the bonus is its own column.
    expect(rows[0].pointsFor).toBe(25);
    expect(rows[0].differential).toBe(5);
    expect(rows[1].teamId).toBe("a");
    expect(rows[1].rank).toBe(2);
  });

  it("adds the bonus in every game scored, not once", () => {
    const rows = reversePairsStandings(
      ["a", "b"],
      [
        game(["a"], 25, 20, ["b"]),
        game(["b"], 25, 20, ["a"]),
        game(["a"], 25, 20, ["b"]),
        game(["a"], null, null, ["b"]),
      ],
      { ranking: "wins_pct", bonus: { b: 6 } },
    );
    const b = rows.find((r) => r.teamId === "b")!;
    // Three scored games x 6; the unscored fourth adds nothing yet.
    expect(b.bonus).toBe(18);
    // b: lost 20-25, won 25-20, lost 20-25 → 65 for, 70 against.
    expect(b.pointPct).toBeCloseTo((65 + 18) / (65 + 18 + 70));
    expect(b.won).toBe(1);
  });

  it("never lets a bonus beat a win", () => {
    const rows = reversePairsStandings(
      ["a", "b"],
      [game(["a"], 25, 24, ["b"])],
      { ranking: "wins_pct", bonus: { b: 6 } },
    );
    expect(rows.map((r) => r.teamId)).toEqual(["a", "b"]);
  });

  it("adds the bonus to the total in the differential order", () => {
    const rows = reversePairsStandings(
      ["a", "b"],
      [game(["a"], 25, 24, ["b"])],
      { bonus: { b: 4 } },
    );
    expect(rows[0].teamId).toBe("b");
    expect(rows[0].differential).toBe(3);
  });

  it("ignores a bonus for a pair not in the event", () => {
    const rows = reversePairsStandings(["a"], [], {
      ranking: "wins_pct",
      bonus: { stranger: 6 },
    });
    expect(rows.map((r) => r.teamId)).toEqual(["a"]);
    expect(rows[0].pointPct).toBeNull();
  });
});

describe("partnerMatrix", () => {
  it("counts partnerships and leaves the diagonal at zero", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const m = partnerMatrix(ids, [
      game(["a", "b", "c"], 25, 20, ["d", "e", "f"]),
    ]);

    const at = (x: string, y: string) =>
      m.counts[ids.indexOf(x)][ids.indexOf(y)];

    expect(at("a", "b")).toBe(1);
    expect(at("b", "a")).toBe(1); // symmetric
    expect(at("a", "a")).toBe(0); // a pair is not its own partner
    expect(at("a", "d")).toBe(0); // opponents are not partners
  });

  it("counts a repeated partnership and reports it", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const m = partnerMatrix(ids, [
      game(["a", "b", "c"], 25, 20, ["d", "e", "f"]),
      game(["a", "b", "d"], 25, 20, ["c", "e", "f"]),
    ]);

    expect(m.counts[0][1]).toBe(2);
    expect(m.max).toBe(2);
    // a-b are together in both games; so are e-f, who stayed on side B.
    expect(m.repeats).toEqual([
      { a: "a", b: "b", times: 2 },
      { a: "e", b: "f", times: 2 },
    ]);
  });

  it("lists the pairings that never happened", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const m = partnerMatrix(ids, [
      game(["a", "b", "c"], 25, 20, ["d", "e", "f"]),
    ]);
    // a has partnered b and c; never d, e or f.
    expect(m.neverTogether).toContainEqual({ a: "a", b: "d" });
    expect(m.neverTogether).not.toContainEqual({ a: "a", b: "b" });
    expect(m.neverTogether).toHaveLength(9); // 15 pairings - 6 realised
  });

  it("counts an unscored game — the draw happened either way", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const m = partnerMatrix(ids, [
      game(["a", "b", "c"], null, null, ["d", "e", "f"]),
    ]);
    expect(m.counts[0][1]).toBe(1);
  });

  it("ignores pairs outside the given list", () => {
    const m = partnerMatrix(
      ["a", "b"],
      [game(["a", "b", "zz"], 25, 20, ["d", "e", "f"])],
    );
    expect(m.counts).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });
});
