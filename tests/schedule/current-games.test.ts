import { describe, expect, it } from "vitest";

import type { ScheduleMatch } from "@/lib/queries/leagues";
import { currentGames } from "@/lib/schedule/current-games";

const TZ = "America/Toronto";
const pad = (n: number) => String(n).padStart(2, "0");

/** An ISO instant on the game day (2026-07-25, EDT = -04:00). */
const T = (h: number, m: number): string =>
  `2026-07-25T${pad(h)}:${pad(m)}:00-04:00`;
/** A JS Date "now" on the game day. */
const NOW = (h: number, m: number): Date => new Date(T(h, m));

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

/** The 6:30 wave: three courts scheduled, nothing scored yet. */
const wave630 = [
  mk("Court 1", T(18, 30), "scheduled", "A", "B"),
  mk("Court 2", T(18, 30), "scheduled", "C", "D"),
  mk("Court 6", T(18, 30), "scheduled", "E", "F"),
];

describe("currentGames (time-gated)", () => {
  it("shows nothing before the 30-minute window opens", () => {
    // First game 6:30 → window opens 6:00. At 5:30 there's nothing.
    expect(currentGames(wave630, NOW(17, 30), TZ)).toEqual([]);
  });

  it("shows every court in the wave once the window opens (30 min before)", () => {
    const cur = currentGames(wave630, NOW(18, 0), TZ);
    expect(cur.map((c) => c.court)).toEqual(["Court 1", "Court 2", "Court 6"]);
  });

  it("fills the board before any score is entered — not just started courts", () => {
    // The old behavior showed nothing until a score existed; now all show.
    const cur = currentGames(wave630, NOW(18, 15), TZ);
    expect(cur).toHaveLength(3);
  });

  it("shows nothing when today has no games (off day)", () => {
    // Games are on 07-25; 'now' is the 26th → no games today.
    const now = new Date("2026-07-26T18:15:00-04:00");
    expect(currentGames(wave630, now, TZ)).toEqual([]);
  });

  it("ignores games on other days when picking a court's current game", () => {
    const today = mk("Court 1", T(18, 30), "scheduled", "A", "B");
    const tomorrow = mk("Court 1", "2026-07-26T18:30:00-04:00", "scheduled");
    const cur = currentGames([tomorrow, today], NOW(18, 15), TZ);
    expect(cur).toHaveLength(1);
    expect(cur[0].match).toBe(today);
  });

  it("advances to the next non-final game on a court", () => {
    const g1 = mk("Court 1", T(18, 30), "completed", "Raj", "Wes");
    const g2 = mk("Court 1", T(19, 10), "scheduled", "Raj", "Bird");
    const cur = currentGames([g2, g1], NOW(19, 15), TZ);
    expect(cur[0].match).toBe(g2);
  });

  it("prefers an in-progress game over an earlier not-yet-final one", () => {
    const g1 = mk("Court 1", T(18, 30), "scheduled", "Raj", "Wes"); // delayed
    const g2 = mk("Court 1", T(19, 10), "in_progress", "Raj", "Bird");
    expect(currentGames([g1, g2], NOW(19, 15), TZ)[0].match).toBe(g2);
  });

  it("omits a court whose games today are all final", () => {
    const matches = [
      mk("Court 1", T(18, 30), "completed"),
      mk("Court 1", T(19, 10), "completed"),
    ];
    expect(currentGames(matches, NOW(19, 30), TZ)).toEqual([]);
  });

  it("orders courts by number, not string", () => {
    const cur = currentGames(
      [
        mk("Court 10", T(18, 30), "scheduled", "A", "B"),
        mk("Court 2", T(18, 30), "scheduled", "C", "D"),
        mk("Court 1", T(18, 30), "scheduled", "E", "F"),
      ],
      NOW(18, 15),
      TZ,
    );
    expect(cur.map((c) => c.court)).toEqual(["Court 1", "Court 2", "Court 10"]);
  });

  it("orders a non-numeric court name last", () => {
    const cur = currentGames(
      [
        mk("Beach", T(18, 30), "scheduled", "A", "B"),
        mk("Court 1", T(18, 30), "scheduled", "C", "D"),
      ],
      NOW(18, 15),
      TZ,
    );
    expect(cur.map((c) => c.court)).toEqual(["Court 1", "Beach"]);
  });

  it("breaks a same-time tie on a court by round order", () => {
    const early = {
      ...mk("Court 1", T(18, 30), "scheduled", "A", "B"),
      round: 1,
    };
    const late = {
      ...mk("Court 1", T(18, 30), "scheduled", "C", "D"),
      round: 2,
    };
    const cur = currentGames([late, early], NOW(18, 15), TZ);
    expect(cur[0].match).toBe(early);
  });

  it("skips games with no court or a missing team", () => {
    const noCourt = mk(null, T(18, 30), "in_progress");
    const bye = mk("Court 1", T(18, 30), "scheduled", "Raj", null);
    expect(currentGames([noCourt, bye], NOW(18, 15), TZ)).toEqual([]);
  });
});
