import { describe, expect, it } from "vitest";

import {
  matchOutcome,
  playoffNightsFor,
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

describe("tallyAttendance", () => {
  // Three games a night per team, two nights; night 2 is the playoff.
  const nightOfMatch = new Map([
    ["n1g1", "2026-09-18"],
    ["n1g2", "2026-09-18"],
    ["n1g3", "2026-09-18"],
    ["n2g1", "2026-09-25"],
    ["n2g2", "2026-09-25"],
    ["n2g3", "2026-09-25"],
  ]);
  const playoffNights = new Set(["2026-09-25"]);
  const results: Record<string, "win" | "loss" | "tie"> = {
    "n2g1:t1": "win",
    "n2g2:t1": "tie",
    "n2g3:t1": "win",
    "n1g1:t1": "win",
  };
  const outcomeOf = (m: string, t: string) => results[`${m}:${t}`] ?? null;

  const tally = (appearances: Appearance[], absences: Absence[] = []) =>
    tallyAttendance({
      appearances,
      absences,
      nightOfMatch,
      outcomeOf,
      playoffNights,
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

  it("counts playoff game wins only on playoff nights, and only outright wins", () => {
    const t = tally([
      appear("n1g1", "t1", "Liam Johnson"), // a win, but not a playoff night
      appear("n2g1", "t1", "Liam Johnson"), // playoff win
      appear("n2g2", "t1", "Liam Johnson"), // playoff tie — not a win
      appear("n2g3", "t1", "Liam Johnson"), // playoff win
    ]);
    expect(t.get("n:liam johnson")?.playoffGameWins).toBe(2);
  });

  // Their team won a game they weren't on court for: not their win.
  it("does not credit a playoff win for a game the player sat out", () => {
    const t = tally([appear("n2g2", "t1", "Stefan Salo")]);
    expect(t.get("n:stefan salo")?.playoffGameWins).toBe(0);
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
      playoffGameWins: 0,
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

  // Their own team still needed covering, whatever they did elsewhere.
  it("still counts a miss if they subbed for a different team that night", () => {
    const t = tally(
      [appear("n1g1", "t2", "Rowan Adam", "sub")],
      [absent("n1g2", "t1", "Rowan Adam")],
    );
    expect(t.get("n:rowan adam")).toMatchObject({
      daysPlayed: 1,
      nightsMissed: 1,
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
