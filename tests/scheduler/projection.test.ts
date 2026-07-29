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

/** A projection with a full slate (default 12) and explicit per-team schedules. */
function proj(
  scheduled: Record<string, number>,
  fullSlate = 12,
): RankProjection {
  return { fullSlate, scheduledByTeam: new Map(Object.entries(scheduled)) };
}

// Only matches among the ranked teams count, so every opponent here is in scope.
// "filler" is a punching bag that soaks up games to make the counts unequal.
describe("rankStandings — projection (slate-length normalization)", () => {
  // Spikers 10–2 over 12 games; Rebels 9–1 over a 10-game slate (better rate).
  const story = [
    ...beats("spikers", "rebels", 1),
    ...beats("spikers", "filler", 9),
    ...beats("filler", "spikers", 2),
    ...beats("rebels", "filler", 9),
  ];
  const ids = ["spikers", "rebels", "filler"];
  // Rebels joined mid-season → a 10-game schedule; the rest play the full 12.
  const schedule = proj({ spikers: 12, rebels: 10, filler: 12 });

  it("keeps the shorter-slate team behind on raw totals WITHOUT projection", () => {
    const rows = rankStandings(ids, story, undefined, "differential");
    expect(rows[0].teamId).toBe("spikers"); // 10 raw wins > 9
    expect(rows.every((r) => !r.projected)).toBe(true);
  });

  it("lifts the shorter-slate team once its 10-game slate is scaled to 12 (×1.2)", () => {
    const rows = rankStandings(ids, story, undefined, "differential", schedule);
    expect(rows[0].teamId).toBe("rebels"); // 9 × 12/10 = 10.8 > 10
    expect(rows.find((r) => r.teamId === "rebels")!.projected).toBe(true);
    expect(rows.find((r) => r.teamId === "spikers")!.projected).toBe(false);
  });

  it("leaves actual win/loss totals untouched — projection is ranking-only", () => {
    const rows = rankStandings(ids, story, undefined, "ova", schedule);
    const rebels = rows.find((r) => r.teamId === "rebels")!;
    expect(rebels.mw).toBe(9);
    expect(rebels.ml).toBe(1);
    expect(rebels.projected).toBe(true);
  });

  it("normalizes by SCHEDULE, not games played — a 2–0 late team clears 2–2 teams", () => {
    // The real scenario: a late pair 2–0 over a 10-game slate should sit ABOVE
    // full-slate teams sitting 2–2, because 2 × 12/10 = 2.4 > 2 match wins.
    const m = [
      ...beats("late", "filler", 2), // 2–0, only 2 games played
      ...beats("reg", "filler", 2), // 2–2 over 4 games
      ...beats("filler", "reg", 2),
    ];
    const rows = rankStandings(
      ["late", "reg", "filler"],
      m,
      undefined,
      "differential",
      proj({ late: 10, reg: 12, filler: 12 }),
    );
    const late = rows.findIndex((r) => r.teamId === "late");
    const reg = rows.findIndex((r) => r.teamId === "reg");
    expect(late).toBeLessThan(reg);
    expect(rows.find((r) => r.teamId === "late")!.projected).toBe(true);
    // A tiny sample isn't blown up to a full projection: 2 wins → 2.4, not 12.
    expect(rows.find((r) => r.teamId === "reg")!.projected).toBe(false);
  });

  it("does not scale a team already on the full slate", () => {
    const m = [...beats("full", "filler", 8), ...beats("filler", "full", 4)];
    const rows = rankStandings(
      ["full", "filler"],
      m,
      undefined,
      "ova",
      proj({ full: 12, filler: 12 }),
    );
    expect(rows.find((r) => r.teamId === "full")!.projected).toBe(false);
  });

  it("scales point differential in differential mode", () => {
    // A: 5–0 over a 10-game slate with huge margins → 5 × 1.2 = 6 wins.
    // B: 6–0 over the full 12 with tiny margins → 6 wins. Tied on projected
    // wins, so projected point differential decides — A's margins win it.
    const m = [
      ...beats("A", "filler", 5, [21, 3]),
      ...beats("B", "filler", 6, [21, 19]),
    ];
    const rows = rankStandings(
      ["A", "B", "filler"],
      m,
      undefined,
      "differential",
      proj({ A: 10, B: 12, filler: 12 }),
    );
    expect(rows[0].teamId).toBe("A");
    expect(rows.find((r) => r.teamId === "A")!.projected).toBe(true);
    expect(rows.find((r) => r.teamId === "B")!.projected).toBe(false);
  });

  it("is a no-op when every team is already on the full slate", () => {
    const m = [...beats("A", "B", 8), ...beats("B", "A", 4)]; // both 12 games
    const plain = rankStandings(["A", "B"], m, undefined, "differential");
    const projected = rankStandings(
      ["A", "B"],
      m,
      undefined,
      "differential",
      proj({ A: 12, B: 12 }),
    );
    expect(projected.map((r) => r.teamId)).toEqual(plain.map((r) => r.teamId));
    expect(projected.every((r) => !r.projected)).toBe(true);
  });
});
