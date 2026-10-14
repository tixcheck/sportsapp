import { describe, expect, it } from "vitest";

import { teamGroupsFromGames } from "@/lib/email/team-groups";

describe("teamGroupsFromGames", () => {
  it("groups a night's teams by gym, each team once", () => {
    const groups = teamGroupsFromGames([
      {
        venue: "Terry Miller",
        date: "2026-10-15",
        homeTeamId: "a",
        awayTeamId: "b",
      },
      {
        venue: "Terry Miller",
        date: "2026-10-15",
        homeTeamId: "a",
        awayTeamId: "c",
      },
      {
        venue: "Notre Dame",
        date: "2026-10-15",
        homeTeamId: "d",
        awayTeamId: "e",
      },
    ]);
    expect(groups).toEqual([
      {
        label: "Notre Dame · Thu, Oct 15",
        date: "2026-10-15",
        teamIds: ["d", "e"],
      },
      {
        label: "Terry Miller · Thu, Oct 15",
        date: "2026-10-15",
        teamIds: ["a", "b", "c"],
      },
    ]);
  });

  it("keeps the same gym on different nights apart, earliest first", () => {
    const groups = teamGroupsFromGames([
      { venue: "Gym", date: "2026-10-22", homeTeamId: "x", awayTeamId: "y" },
      { venue: "Gym", date: "2026-10-15", homeTeamId: "a", awayTeamId: "b" },
    ]);
    expect(groups.map((g) => g.date)).toEqual(["2026-10-15", "2026-10-22"]);
  });

  it("takes the known team from a game with an empty seat, and skips games with no gym or no teams", () => {
    const groups = teamGroupsFromGames([
      { venue: "Gym", date: "2026-10-15", homeTeamId: "a", awayTeamId: null },
      { venue: "Gym", date: "2026-10-15", homeTeamId: null, awayTeamId: null },
      { venue: null, date: "2026-10-15", homeTeamId: "z", awayTeamId: "w" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].teamIds).toEqual(["a"]);
  });
});
