import { describe, expect, it } from "vitest";

import { editLeagueSchema } from "@/lib/validations/league";

/** Big Shoots as saved, the league that exposed the 1×/2× cap. */
const base = {
  name: "Big Shoots Volleyball 2026-2027",
  startDate: "2026-09-18",
  endDate: "2027-05-14",
  venue: "Holody Centre Guelph",
  courts: 2,
  roundsPerTeam: 33,
  gamesPerTeam: null,
  gamesPerWeek: 3,
  minutesPerGame: 45,
  tiebreaker: "ova" as const,
  pairingOrder: "sequential" as const,
  projectShortTeams: false,
  courtList: null,
  slotDayOfWeek: 5,
  slotStartTime: "18:45",
  formatId: "custom",
  twoSetRoundRobin: true,
  blackoutDates: ["2026-12-25", "2027-01-01"],
  sessionNights: 3,
};

describe("editLeagueSchema", () => {
  // Capped at 2, this league's settings could not be saved at all — and
  // "fixing" the field to 2 would have shrunk the season to three weeks.
  it("accepts a season of weekly round robins", () => {
    expect(editLeagueSchema.safeParse(base).success).toBe(true);
  });

  it("still accepts the ordinary single and double round robin", () => {
    for (const roundsPerTeam of [1, 2]) {
      expect(
        editLeagueSchema.safeParse({ ...base, roundsPerTeam }).success,
      ).toBe(true);
    }
  });

  it("rejects no round robins at all", () => {
    expect(
      editLeagueSchema.safeParse({ ...base, roundsPerTeam: 0 }).success,
    ).toBe(false);
  });

  it("allows a league with no sessions", () => {
    expect(
      editLeagueSchema.safeParse({ ...base, sessionNights: null }).success,
    ).toBe(true);
    const { sessionNights: _omit, ...withoutSessions } = base;
    void _omit;
    expect(editLeagueSchema.safeParse(withoutSessions).success).toBe(true);
  });

  // A one-night session would make every night a playoff.
  it("rejects a one-night session", () => {
    expect(
      editLeagueSchema.safeParse({ ...base, sessionNights: 1 }).success,
    ).toBe(false);
  });
});
