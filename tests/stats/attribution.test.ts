import { describe, expect, it } from "vitest";

import {
  attributeByAppearance,
  partnershipCounts,
  pairsNeverTogether,
  type Appearance,
  type MatchSets,
} from "@/lib/stats/attribution";
import { computePlayerStats } from "@/lib/stats/player-stats";

function app(over: Partial<Appearance> = {}): Appearance {
  return {
    matchId: "m1",
    teamId: "t1",
    userId: "u1",
    playerName: "Ryan Jacklin",
    role: "rostered",
    ...over,
  };
}

/** Two matches on one night; t1 wins the first 25-19, loses the second 20-25. */
const SETS: MatchSets[] = [
  { matchId: "m1", teamId: "t1", sets: [{ for: 25, against: 19 }] },
  { matchId: "m1", teamId: "t2", sets: [{ for: 19, against: 25 }] },
  { matchId: "m2", teamId: "t1", sets: [{ for: 20, against: 25 }] },
  { matchId: "m2", teamId: "t2", sets: [{ for: 25, against: 20 }] },
];

describe("attributeByAppearance", () => {
  it("credits a player only with the matches they turned up for", () => {
    // The whole point: missing week two must not count as playing week two.
    const [p] = attributeByAppearance([app({ matchId: "m1" })], SETS);
    expect(p.sets).toEqual([{ for: 25, against: 19 }]);
    expect(computePlayerStats(p.sets).gamesPlayed).toBe(1);
  });

  it("credits both matches when they played both", () => {
    const [p] = attributeByAppearance(
      [app({ matchId: "m1" }), app({ matchId: "m2" })],
      SETS,
    );
    expect(computePlayerStats(p.sets).gamesPlayed).toBe(2);
    expect(computePlayerStats(p.sets).wins).toBe(1);
  });

  it("credits a sub exactly like a rostered player", () => {
    // They stood on the court; the points went on the scoreboard.
    const rostered = attributeByAppearance([app({ matchId: "m1" })], SETS)[0];
    const sub = attributeByAppearance(
      [
        app({
          matchId: "m1",
          userId: "u9",
          playerName: "Sub Person",
          role: "sub",
        }),
      ],
      SETS,
    )[0];
    expect(sub.sets).toEqual(rostered.sets);
    expect(sub.matchesAsSub).toBe(1);
    expect(sub.matchesRostered).toBe(0);
  });

  it("gives the replaced player nothing, without needing an absence record", () => {
    // Only the sub appears for m2, so the absent player simply has one match.
    const players = attributeByAppearance(
      [
        app({ matchId: "m1" }),
        app({
          matchId: "m2",
          userId: "u9",
          playerName: "Sub Person",
          role: "sub",
        }),
      ],
      SETS,
    );
    const regular = players.find((p) => p.userId === "u1")!;
    const sub = players.find((p) => p.userId === "u9")!;
    expect(computePlayerStats(regular.sets).gamesPlayed).toBe(1);
    expect(computePlayerStats(sub.sets).gamesPlayed).toBe(1);
  });

  it("scores from the team's own perspective, not the home team's", () => {
    const away = attributeByAppearance(
      [app({ matchId: "m1", teamId: "t2", userId: "u2", playerName: "Away" })],
      SETS,
    )[0];
    expect(away.sets).toEqual([{ for: 19, against: 25 }]);
    expect(computePlayerStats(away.sets).wins).toBe(0);
  });

  it("follows a player across teams when the draft moves them", () => {
    const [p] = attributeByAppearance(
      [
        app({ matchId: "m1", teamId: "t1" }),
        app({ matchId: "m2", teamId: "t2" }),
      ],
      SETS,
    );
    expect(p.teamIds).toEqual(["t1", "t2"]);
    // Won with t1 (25-19), won again with t2 (25-20).
    expect(computePlayerStats(p.sets).wins).toBe(2);
  });

  it("does not double a player listed twice for the same match", () => {
    const [p] = attributeByAppearance([app(), app()], SETS);
    expect(computePlayerStats(p.sets).gamesPlayed).toBe(1);
  });

  it("treats an accountless sub as one person despite messy typing", () => {
    const players = attributeByAppearance(
      [
        app({ matchId: "m1", userId: null, playerName: "Jon Moser" }),
        app({ matchId: "m2", userId: null, playerName: "  jon   MOSER " }),
      ],
      SETS,
    );
    expect(players).toHaveLength(1);
    expect(computePlayerStats(players[0].sets).gamesPlayed).toBe(2);
  });

  it("keeps a re-drafted accountless player whole across teams", () => {
    // The first version scoped names to the team, which split a re-drafted
    // player into two half-seasons — on the seeded league it turned five
    // matches across two teams into two players with two and three. Since this
    // format re-drafts everyone every three weeks, that is the case to get
    // right; two genuinely different people sharing a name is rarer and the
    // organizer can add an initial.
    const players = attributeByAppearance(
      [
        app({
          matchId: "m1",
          teamId: "t1",
          userId: null,
          playerName: "Jon Moser",
        }),
        app({
          matchId: "m2",
          teamId: "t2",
          userId: null,
          playerName: "Jon Moser",
        }),
      ],
      SETS,
    );
    expect(players).toHaveLength(1);
    expect(players[0].teamIds).toEqual(["t1", "t2"]);
    expect(computePlayerStats(players[0].sets).gamesPlayed).toBe(2);
  });

  it("counts an appearance in an unscored match without inventing sets", () => {
    const [p] = attributeByAppearance(
      [app({ matchId: "not-played-yet" })],
      SETS,
    );
    expect(p.sets).toEqual([]);
    expect(p.matchesRostered).toBe(1);
  });
});

describe("partnershipCounts", () => {
  /** Two matches, same night, same team — that is ONE occasion together. */
  const NIGHT = new Map([
    ["m1", "2026-09-01"],
    ["m2", "2026-09-01"],
    ["m3", "2026-09-08"],
  ]);

  const together = (matchId: string) =>
    [
      app({ matchId, userId: "a", playerName: "A" }),
      app({ matchId, userId: "b", playerName: "B" }),
    ] as Appearance[];

  it("counts a night together once, not once per game", () => {
    const counts = partnershipCounts(
      [...together("m1"), ...together("m2")],
      NIGHT,
    );
    expect(counts.get("u:a|u:b")).toBe(1);
  });

  it("counts separate nights separately", () => {
    const counts = partnershipCounts(
      [...together("m1"), ...together("m3")],
      NIGHT,
    );
    expect(counts.get("u:a|u:b")).toBe(2);
  });

  it("does not pair opponents", () => {
    const counts = partnershipCounts(
      [
        app({ matchId: "m1", teamId: "t1", userId: "a", playerName: "A" }),
        app({ matchId: "m1", teamId: "t2", userId: "b", playerName: "B" }),
      ],
      NIGHT,
    );
    expect(counts.size).toBe(0);
  });

  it("is order-independent — a,b and b,a are one pair", () => {
    const counts = partnershipCounts(
      [
        app({ matchId: "m1", userId: "b", playerName: "B" }),
        app({ matchId: "m1", userId: "a", playerName: "A" }),
      ],
      NIGHT,
    );
    expect([...counts.keys()]).toEqual(["u:a|u:b"]);
  });

  it("pairs everyone in a lineup with everyone else", () => {
    const counts = partnershipCounts(
      [
        app({ matchId: "m1", userId: "a", playerName: "A" }),
        app({ matchId: "m1", userId: "b", playerName: "B" }),
        app({ matchId: "m1", userId: "c", playerName: "C" }),
      ],
      NIGHT,
    );
    expect(counts.size).toBe(3); // ab, ac, bc
  });

  it("ignores a match with no night mapped", () => {
    expect(partnershipCounts(together("m1"), new Map()).size).toBe(0);
  });
});

describe("pairsNeverTogether", () => {
  it("finds the combinations the organizer still owes people", () => {
    const counts = new Map([["u:a|u:b", 3]]);
    const gaps = pairsNeverTogether(["u:a", "u:b", "u:c"], counts);
    expect(gaps).toEqual([
      ["u:a", "u:c"],
      ["u:b", "u:c"],
    ]);
  });

  it("returns nothing once everyone has played with everyone", () => {
    const counts = new Map([
      ["u:a|u:b", 1],
      ["u:a|u:c", 2],
      ["u:b|u:c", 1],
    ]);
    expect(pairsNeverTogether(["u:a", "u:b", "u:c"], counts)).toEqual([]);
  });
});
