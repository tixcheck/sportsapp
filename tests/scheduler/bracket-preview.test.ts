import { describe, expect, it } from "vitest";

import { genericBracketPreview, roundName } from "@/lib/scheduler/bracket";

describe("roundName", () => {
  it("names rounds by match count", () => {
    expect(roundName(1)).toBe("Final");
    expect(roundName(2)).toBe("Semifinals");
    expect(roundName(4)).toBe("Quarterfinals");
    expect(roundName(8)).toBe("Round of 16");
  });
});

describe("genericBracketPreview", () => {
  it("8-team bracket: canonical seed matchups and rounds", () => {
    const p = genericBracketPreview({
      playoffTeams: 8,
      available: 16,
      courts: 4,
      slotMinutes: 30,
    })!;
    expect(p.teamCount).toBe(8);
    expect(p.size).toBe(8);
    expect(p.byes).toBe(0);
    expect(p.rounds.map((r) => r.name)).toEqual([
      "Quarterfinals",
      "Semifinals",
      "Final",
    ]);
    // 1v8, 4v5, 2v7, 3v6
    expect(p.rounds[0].matchups).toEqual([
      { high: 1, low: 8 },
      { high: 4, low: 5 },
      { high: 2, low: 7 },
      { high: 3, low: 6 },
    ]);
    // QF(4)/4 courts=1 wave, SF=1, F=1 → 3 * 30
    expect(p.estimatedMinutes).toBe(90);
  });

  it("clamps the field to the teams available", () => {
    const p = genericBracketPreview({
      playoffTeams: 8,
      available: 5,
      courts: 2,
      slotMinutes: 20,
    })!;
    expect(p.teamCount).toBe(5);
    expect(p.size).toBe(8);
    expect(p.byes).toBe(3);
    // seeds 6,7,8 don't exist → those become byes for 3,2,1
    const byeHighs = p.rounds[0]
      .matchups!.filter((m) => m.low === null)
      .map((m) => m.high)
      .sort((a, b) => a - b);
    expect(byeHighs).toEqual([1, 2, 3]);
  });

  it("more matches than courts adds waves to the estimate", () => {
    const p = genericBracketPreview({
      playoffTeams: 8,
      available: 8,
      courts: 1,
      slotMinutes: 30,
    })!;
    // 1 court: QF=4 waves, SF=2, F=1 → 7 * 30
    expect(p.estimatedMinutes).toBe(210);
  });

  it("byes in round 1 are not counted as played waves", () => {
    const p = genericBracketPreview({
      playoffTeams: 5,
      available: 5,
      courts: 1,
      slotMinutes: 10,
    })!;
    // R1 played = 1 real match (4v5); byes for 1,2,3. SF=2, F=1.
    // waves: 1 + 2 + 1 = 4 → 40
    expect(p.estimatedMinutes).toBe(40);
  });

  it("returns null when fewer than 2 teams", () => {
    expect(
      genericBracketPreview({
        playoffTeams: 1,
        available: 10,
        courts: 2,
        slotMinutes: 20,
      }),
    ).toBeNull();
    expect(
      genericBracketPreview({
        playoffTeams: 8,
        available: 0,
        courts: 2,
        slotMinutes: 20,
      }),
    ).toBeNull();
  });
});
