import { describe, expect, it } from "vitest";

import {
  matchOutcome,
  playoffNightsFor,
  seriesFinalWinners,
  tallyAttendance,
  type Absence,
} from "@/lib/stats/attendance";
import type { Appearance } from "@/lib/stats/attribution";

const SEASON = [
  "2026-09-18",
  "2026-09-25",
  "2026-10-02",
  "2026-10-09",
  "2026-10-16",
  "2026-10-23",
];

describe("playoffNightsFor", () => {
  it("makes every third played night a playoff", () => {
    expect([...playoffNightsFor(SEASON, 3)]).toEqual([
      "2026-10-02",
      "2026-10-23",
    ]);
  });

  // Christmas and New Year produce no matches, so they are not nights at all.
  // Counting played nights is what keeps session 5's playoff off a holiday.
  it("counts played nights, so a skipped week cannot shift a session", () => {
    const withGap = ["2026-12-11", "2026-12-18", "2027-01-08"];
    expect([...playoffNightsFor(withGap, 3)]).toEqual(["2027-01-08"]);
  });

  it("has no playoff nights for a league without sessions", () => {
    expect(playoffNightsFor(SEASON, null).size).toBe(0);
    // A one-night session would make every night a playoff — no rule at all.
    expect(playoffNightsFor(SEASON, 1).size).toBe(0);
  });

  it("orders and de-duplicates the nights it is given", () => {
    const shuffled = ["2026-10-02", "2026-09-18", "2026-09-25", "2026-09-18"];
    expect([...playoffNightsFor(shuffled, 3)]).toEqual(["2026-10-02"]);
  });

  it("leaves a trailing partial session without a playoff", () => {
    expect([...playoffNightsFor(SEASON.slice(0, 5), 3)]).toEqual([
      "2026-10-02",
    ]);
  });
});

describe("matchOutcome", () => {
  const set = (f: number, a: number) => ({ for: f, against: a });

  it("reads a 2–0 as a win and 0–2 as a loss", () => {
    expect(matchOutcome([set(25, 20), set(25, 23)])).toBe("win");
    expect(matchOutcome([set(20, 25), set(23, 25)])).toBe("loss");
  });

  // Games are two sets; a split is a tie, and "games won" means won outright.
  it("reads a 1–1 split as a tie, not a win", () => {
    expect(matchOutcome([set(25, 20), set(22, 25)])).toBe("tie");
  });

  it("is null for a game nobody has scored", () => {
    expect(matchOutcome([])).toBeNull();
  });
});

const appear = (
  matchId: string,
  teamId: string,
  playerName: string,
  role: Appearance["role"] = "rostered",
  userId: string | null = null,
): Appearance => ({ matchId, teamId, userId, playerName, role });

const absent = (
  matchId: string,
  teamId: string,
  playerName: string,
  userId: string | null = null,
): Absence => ({ matchId, teamId, userId, playerName });

describe("seriesFinalWinners", () => {
  // Playoff Format 1 on Oct 2: semis round 1, final (2,1), 3rd place (2,2).
  const game = (
    id: string,
    round: number,
    pos: number,
    home: string,
    away: string,
    session: string | null = "2026-10-02",
  ) => ({
    id,
    round,
    bracketPosition: pos,
    playoffSession: session,
    night: "2026-10-02",
    homeTeamId: home,
    awayTeamId: away,
  });
  const won: Record<string, string> = {
    sf1: "t1",
    sf2: "t3",
    final: "t3",
    bronze: "t4",
    later: "t2",
  };
  const outcomeOf = (m: string, t: string) =>
    won[m] ? (won[m] === t ? "win" : "loss") : null;

  it("finds each series' final and who won it", () => {
    const finals = seriesFinalWinners(
      [
        game("sf1", 1, 1, "t1", "t2"),
        game("sf2", 1, 2, "t3", "t4"),
        game("final", 2, 1, "t1", "t3"),
        game("bronze", 2, 2, "t2", "t4"),
      ],
      new Set(),
      outcomeOf,
    );
    // Only the final — not a semi, not the 3rd-place game.
    expect([...finals]).toEqual([["final", "t3"]]);
  });

  it("keeps two sessions' finals apart", () => {
    const finals = seriesFinalWinners(
      [
        game("final", 2, 1, "t1", "t3"),
        game("later", 2, 1, "t2", "t4", "2026-10-23"),
      ],
      new Set(),
      outcomeOf,
    );
    expect(finals.get("final")).toBe("t3");
    expect(finals.get("later")).toBe("t2");
  });

  it("leaves out a final nobody has won yet", () => {
    const finals = seriesFinalWinners(
      [game("unplayed", 2, 1, "t1", "t3")],
      new Set(),
      outcomeOf,
    );
    expect(finals.size).toBe(0);
  });

  it("reads a session-less bracket on a playoff night as that night's series", () => {
    const finals = seriesFinalWinners(
      [game("final", 2, 1, "t1", "t3", null)],
      new Set(["2026-10-02"]),
      outcomeOf,
    );
    expect(finals.get("final")).toBe("t3");
  });

  it("ignores regular games", () => {
    const finals = seriesFinalWinners(
      [{ ...game("final", 2, 1, "t1", "t3"), bracketPosition: null }],
      new Set(["2026-10-02"]),
      outcomeOf,
    );
    expect(finals.size).toBe(0);
  });
});

describe("tallyAttendance", () => {
  // Three games a night per team; night 2 is the playoff, n2g3 its final.
  const nightOfMatch = new Map([
    ["n1g1", "2026-09-18"],
    ["n1g2", "2026-09-18"],
    ["n1g3", "2026-09-18"],
    ["n2g1", "2026-09-25"],
    ["n2g2", "2026-09-25"],
    ["n2g3", "2026-09-25"],
  ]);
  const seriesFinals = new Map([["n2g3", "t1"]]);

  const tally = (appearances: Appearance[], absences: Absence[] = []) =>
    tallyAttendance({
      appearances,
      absences,
      nightOfMatch,
      seriesFinals,
    });

  it("counts a night once, however many games were played in it", () => {
    const t = tally([
      appear("n1g1", "t1", "Jamie Orth"),
      appear("n1g2", "t1", "Jamie Orth"),
      appear("n1g3", "t1", "Jamie Orth"),
    ]);
    expect(t.get("n:jamie orth")?.daysPlayed).toBe(1);
  });

  // The organizer's answer: any night on court is a night played.
  it("counts a night subbing for another team as a day played", () => {
    const t = tally([
      appear("n1g1", "t1", "Jamie Orth"),
      appear("n2g1", "t2", "Jamie Orth", "sub"),
    ]);
    expect(t.get("n:jamie orth")?.daysPlayed).toBe(2);
  });

  // Liam, 2026-09-28: "they should only get a PO W if they win a mini
  // series … one entry per mini series won."
  it("credits one series won for playing in the winning side of the final", () => {
    const t = tally([
      appear("n2g1", "t1", "Liam Johnson"), // the semi — earns nothing itself
      appear("n2g3", "t1", "Liam Johnson"), // the final, won
    ]);
    expect(t.get("n:liam johnson")?.seriesWon).toBe(1);
  });

  it("credits nothing to the losing side of the final", () => {
    const t = tally([appear("n2g3", "t2", "Rowan Adam")]);
    expect(t.get("n:rowan adam")?.seriesWon).toBe(0);
  });

  // Their team won the final while they sat it out: not their series.
  it("credits nothing for a final the player sat out", () => {
    const t = tally([appear("n2g1", "t1", "Stefan Salo")]);
    expect(t.get("n:stefan salo")?.seriesWon).toBe(0);
  });

  it("counts a night missed when the player played none of the team's games", () => {
    const t = tally(
      [appear("n2g1", "t1", "Jamie Orth")],
      [
        absent("n1g1", "t1", "Rowan Adam"),
        absent("n1g2", "t1", "Rowan Adam"),
        absent("n1g3", "t1", "Rowan Adam"),
      ],
    );
    expect(t.get("n:rowan adam")).toEqual({
      daysPlayed: 0,
      seriesWon: 0,
      nightsMissed: 1,
    });
  });

  // Nobody was sent for: they turned up, just late.
  it("does not count a partial night as missed", () => {
    const t = tally(
      [appear("n1g2", "t1", "Rowan Adam"), appear("n1g3", "t1", "Rowan Adam")],
      [absent("n1g1", "t1", "Rowan Adam")],
    );
    expect(t.get("n:rowan adam")?.nightsMissed).toBe(0);
    expect(t.get("n:rowan adam")?.daysPlayed).toBe(1);
  });

  /**
   * Reversed on 2026-09-22, on the owner's instruction: "stats goes to players
   * irrespective of what team they play … they shuffle. But stats are supposed
   * to stay with players."
   *
   * This previously asserted `nightsMissed: 1` — the reasoning being that the
   * player's own team still had to find cover. That is true, and a useful
   * thing for an organizer to know, but it is a fact about the TEAM. Read off
   * a player's row it said they turned out (`Days 1`) and failed to turn out
   * (`Missed 1`) on the same night.
   */
  it("does not count a miss if they played for a different team that night", () => {
    const t = tally(
      [appear("n1g1", "t2", "Rowan Adam", "sub")],
      [absent("n1g2", "t1", "Rowan Adam")],
    );
    expect(t.get("n:rowan adam")).toMatchObject({
      daysPlayed: 1,
      nightsMissed: 0,
    });
  });

  it("identifies an account by id and a guest by normalised name", () => {
    const t = tally(
      [appear("n1g1", "t1", "Liam J", "rostered", "u-liam")],
      [absent("n2g1", "t1", "  JAMIE   orth ")],
    );
    expect(t.get("u:u-liam")?.daysPlayed).toBe(1);
    expect(t.get("n:jamie orth")?.nightsMissed).toBe(1);
  });

  it("ignores rows whose match has no night yet", () => {
    const t = tally(
      [appear("unscheduled", "t1", "Owen Walsh")],
      [absent("unscheduled", "t1", "Owen Walsh")],
    );
    expect(t.size).toBe(0);
  });
});
