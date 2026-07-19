import { describe, expect, it } from "vitest";

import {
  rankStandings,
  type MatchResult,
  type RankProjection,
} from "@/lib/scheduler/tiebreakers";

/** `n` completed best-of-3 games where `w` beats `l` by the given set score. */
function beats(
  w: string,
  l: string,
  n: number,
  score: [number, number] = [21, 10],
): MatchResult[] {
  return Array.from({ length: n }, () => ({
    homeTeamId: w,
    awayTeamId: l,
    sets: [
      { home: score[0], away: score[1] },
      { home: score[0], away: score[1] },
    ],
  }));
}

const TARGET: RankProjection = { targetGames: 12, minGames: 4 };

// Only matches among the ranked teams count, so every opponent here is in scope.
// "filler" is a punching bag that soaks up games to make the counts unequal.
describe("rankStandings — projection (pro-rate short teams)", () => {
  // Spikers 10–2 in 12 games; Rebels 9–1 in 10 (better rate, fewer games).
  const story = [
    ...beats("spikers", "rebels", 1),
    ...beats("spikers", "filler", 9),
    ...beats("filler", "spikers", 2),
    ...beats("rebels", "filler", 9),
  ];
  const ids = ["spikers", "rebels", "filler"];

  it("keeps the 10-game team behind the 12-game team WITHOUT projection", () => {
    const rows = rankStandings(ids, story, undefined, "differential");
    expect(rows[0].teamId).toBe("spikers"); // 10 raw wins > 9
    expect(rows.every((r) => !r.projected)).toBe(true);
  });

  it("puts the better-rate 10-game team AHEAD once projected to 12", () => {
    const rows = rankStandings(ids, story, undefined, "differential", TARGET);
    expect(rows[0].teamId).toBe("rebels"); // 9/10 → 10.8 projected > 10
    const rebels = rows.find((r) => r.teamId === "rebels")!;
    const spikers = rows.find((r) => r.teamId === "spikers")!;
    expect(rebels.projected).toBe(true);
    expect(spikers.projected).toBe(false); // already at target
  });

  it("leaves actual win/loss totals untouched — projection is ranking-only", () => {
    const rows = rankStandings(ids, story, undefined, "ova", TARGET);
    const rebels = rows.find((r) => r.teamId === "rebels")!;
    expect(rebels.mw).toBe(9);
    expect(rebels.ml).toBe(1);
    expect(rebels.projected).toBe(true);
  });

  it("does not project a team below the minimum games threshold", () => {
    // newbie: 3–0 in 3 games (below min 4). veteran: 8–4 in 12.
    const m = [
      ...beats("newbie", "filler", 3),
      ...beats("veteran", "filler", 8),
      ...beats("filler", "veteran", 4),
    ];
    const rows = rankStandings(
      ["newbie", "veteran", "filler"],
      m,
      undefined,
      "differential",
      TARGET,
    );
    const newbie = rows.find((r) => r.teamId === "newbie")!;
    expect(newbie.projected).toBe(false);
    // Ranked on 3 real wins — behind the veteran's 8, not projected to 12.
    expect(rows[0].teamId).toBe("veteran");
  });

  it("does not project a team already at the target", () => {
    const m = [...beats("full", "filler", 8), ...beats("filler", "full", 4)];
    const rows = rankStandings(["full", "filler"], m, undefined, "ova", TARGET);
    expect(rows.find((r) => r.teamId === "full")!.projected).toBe(false);
  });

  it("pro-rates point differential in differential mode", () => {
    // A 6–0 (huge margins) projects to 12 wins; B 12–0 (small margins) is 12.
    // Tied on projected wins → separated by projected differential, A ahead.
    const m = [
      ...beats("A", "filler", 6, [21, 3]),
      ...beats("B", "filler", 12, [21, 19]),
    ];
    const rows = rankStandings(
      ["A", "B", "filler"],
      m,
      undefined,
      "differential",
      TARGET,
    );
    expect(rows[0].teamId).toBe("A");
    expect(rows.find((r) => r.teamId === "A")!.projected).toBe(true);
    expect(rows.find((r) => r.teamId === "B")!.projected).toBe(false);
  });

  it("is a no-op when every team is already at the target", () => {
    const m = [...beats("A", "B", 8), ...beats("B", "A", 4)]; // both 12 games
    const plain = rankStandings(["A", "B"], m, undefined, "differential");
    const projected = rankStandings(
      ["A", "B"],
      m,
      undefined,
      "differential",
      TARGET,
    );
    expect(projected.map((r) => r.teamId)).toEqual(plain.map((r) => r.teamId));
    expect(projected.every((r) => !r.projected)).toBe(true);
  });
});
