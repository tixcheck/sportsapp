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

  it("keeps a result for a pair not in the given list", () => {
    // Dropping them would silently lose a played game.
    const rows = reversePairsStandings(
      ["a"],
      [game(["a", "b", "c"], 25, 20, ["d", "e", "f"])],
    );
    expect(rows).toHaveLength(6);
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
