import { describe, expect, it } from "vitest";

import type { ScheduleMatch } from "@/lib/queries/leagues";
import { currentGames } from "@/lib/schedule/current-games";

const T = (h: number, m: number): string =>
  `2026-07-25T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-04:00`;

function mk(
  court: string | null,
  time: string | null,
  status: string,
  home: string | null = "H",
  away: string | null = "A",
): ScheduleMatch {
  return {
    id: `${court}-${time}-${home}-${away}`,
    round: time ? Number(time.slice(11, 13)) : null,
    scheduledAt: time,
    court,
    status,
    homeTeamId: home,
    awayTeamId: away,
    homeTeamName: home ?? "TBD",
    awayTeamName: away ?? "TBD",
    refTeamId: null,
    refTeamName: null,
    isAbnormal: false,
    sets: [],
  };
}

describe("currentGames", () => {
  it("returns nothing until a court has a played (Live/Final) game", () => {
    const matches = [
      mk("Court 1", T(10, 50), "scheduled"),
      mk("Court 1", T(11, 30), "scheduled"),
    ];
    expect(currentGames(matches)).toEqual([]);
  });

  it("points at the earliest non-Final game once the prior one is Final", () => {
    const g1 = mk("Court 1", T(10, 50), "completed", "Raj", "Wes");
    const g2 = mk("Court 1", T(11, 30), "scheduled", "Raj", "Bird");
    const g3 = mk("Court 1", T(12, 10), "scheduled", "Raj", "Pat");
    const cur = currentGames([g3, g1, g2]);
    expect(cur).toHaveLength(1);
    expect(cur[0]).toMatchObject({ court: "Court 1", match: g2 });
  });

  it("prefers an explicitly Live game over an earlier not-yet-final one", () => {
    const g1 = mk("Court 1", T(10, 50), "scheduled", "Raj", "Wes"); // delayed, not final
    const g2 = mk("Court 1", T(11, 30), "in_progress", "Raj", "Bird");
    expect(currentGames([g1, g2])[0]).toMatchObject({ match: g2 });
  });

  it("shows one current game per court, ordered by court number", () => {
    const c2 = mk("Court 2", T(10, 50), "in_progress", "A", "B");
    const c10 = mk("Court 10", T(10, 50), "in_progress", "C", "D");
    const c1 = mk("Court 1", T(10, 50), "in_progress", "E", "F");
    const cur = currentGames([c2, c10, c1]);
    expect(cur.map((c) => c.court)).toEqual(["Court 1", "Court 2", "Court 10"]);
  });

  it("omits a court whose games are all Final", () => {
    const matches = [
      mk("Court 1", T(10, 50), "completed"),
      mk("Court 1", T(11, 30), "completed"),
    ];
    expect(currentGames(matches)).toEqual([]);
  });

  it("skips games with no court or missing teams", () => {
    const noCourt = mk(null, T(10, 50), "in_progress");
    const bye = mk("Court 1", T(10, 50), "in_progress", "Raj", null);
    expect(currentGames([noCourt, bye])).toEqual([]);
  });
});
