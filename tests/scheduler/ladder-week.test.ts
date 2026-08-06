import { describe, expect, it } from "vitest";

import { planLadderWeek, rankLadderNight } from "@/lib/scheduler/ladder-week";
import type { MatchResult } from "@/lib/scheduler/tiebreakers";

const tier = (divisionId: string, ids: string[]) => ({
  divisionId,
  teamIds: ids,
});

describe("planLadderWeek", () => {
  it("expands the owner's example into nine games", () => {
    // 3 teams at 6 sets each: three pairings, three sets apiece.
    const plan = planLadderWeek([tier("A", ["a", "b", "c"])], 6, 2);
    expect(plan.matches).toHaveLength(9);

    const per = new Map<string, number>();
    for (const m of plan.matches) {
      per.set(m.homeTeamId, (per.get(m.homeTeamId) ?? 0) + 1);
      per.set(m.awayTeamId, (per.get(m.awayTeamId) ?? 0) + 1);
    }
    expect([...per.values()]).toEqual([6, 6, 6]);
  });

  it("never puts a team on two courts at the same time", () => {
    const plan = planLadderWeek(
      [tier("A", ["a1", "a2", "a3", "a4"]), tier("B", ["b1", "b2", "b3"])],
      6,
      3,
    );
    const byWave = new Map<number, string[]>();
    for (const m of plan.matches) {
      const list = byWave.get(m.wave) ?? [];
      list.push(m.homeTeamId, m.awayTeamId);
      byWave.set(m.wave, list);
    }
    for (const teams of byWave.values()) {
      expect(new Set(teams).size).toBe(teams.length);
    }
  });

  it("never puts two games on the same court in the same wave", () => {
    const plan = planLadderWeek(
      [
        tier("A", ["a1", "a2", "a3", "a4"]),
        tier("B", ["b1", "b2", "b3", "b4"]),
      ],
      4,
      3,
    );
    const seen = new Set<string>();
    for (const m of plan.matches) {
      const key = `${m.wave}:${m.courtIndex}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(plan.maxGamesPerWave).toBeLessThanOrEqual(3);
  });

  it("shares the night's courts across tiers rather than per tier", () => {
    const plan = planLadderWeek(
      [tier("A", ["a1", "a2"]), tier("B", ["b1", "b2"])],
      2,
      2,
    );
    // Two tiers of two teams, two sets each, two courts: both tiers can play
    // their first game at once, so the night is two waves, not four.
    expect(plan.waves).toBe(2);
  });

  it("reports teams that couldn't get the full target", () => {
    // 3 teams x 5 sets can't be split evenly — one team gets 4.
    const plan = planLadderWeek([tier("A", ["a", "b", "c"])], 5, 2);
    expect(plan.shortedTeamIds).toHaveLength(1);
  });

  it("spreads a tier's games rather than leaving one tier until last", () => {
    const plan = planLadderWeek(
      [tier("A", ["a1", "a2"]), tier("B", ["b1", "b2"])],
      4,
      1,
    );
    // One court, so games run one at a time — but the tiers alternate.
    const divisions = plan.matches.map((m) => m.divisionId);
    expect(divisions.slice(0, 2)).toEqual(["A", "B"]);
  });

  it("handles a tier too small to play", () => {
    const plan = planLadderWeek([tier("A", ["only"])], 6, 2);
    expect(plan.matches).toEqual([]);
    expect(plan.waves).toBe(0);
  });

  it("always assigns a court within the available count", () => {
    const plan = planLadderWeek(
      [tier("A", ["a1", "a2", "a3", "a4", "a5"])],
      4,
      2,
    );
    for (const m of plan.matches) {
      expect(m.courtIndex).toBeGreaterThanOrEqual(1);
      expect(m.courtIndex).toBeLessThanOrEqual(2);
    }
  });
});

describe("rankLadderNight", () => {
  /** One single-set game. */
  const game = (home: string, away: string, hs: number, as: number) => ({
    homeTeamId: home,
    awayTeamId: away,
    sets: [{ home: hs, away: as }],
  });

  it("ranks each tier on tonight's games only", () => {
    const tiers = [tier("A", ["a", "b", "c"])];
    const matches: MatchResult[] = [
      game("a", "b", 21, 15),
      game("a", "c", 21, 12),
      game("b", "c", 21, 18),
    ];
    const [ranked] = rankLadderNight(tiers, matches);
    expect(ranked.rankedTeamIds).toEqual(["a", "b", "c"]);
    expect(ranked.divisionId).toBe("A");
  });

  it("ignores games involving teams from another tier", () => {
    const tiers = [tier("A", ["a1", "a2"]), tier("B", ["b1", "b2"])];
    const matches: MatchResult[] = [
      game("a1", "a2", 21, 10),
      game("b2", "b1", 21, 10),
      // A cross-tier game shouldn't exist, but must not corrupt either table.
      game("a2", "b1", 21, 0),
    ];
    const [a, b] = rankLadderNight(tiers, matches);
    expect(a.rankedTeamIds).toEqual(["a1", "a2"]);
    expect(b.rankedTeamIds).toEqual(["b2", "b1"]);
  });

  it("keeps a team that didn't play in the tier, ranked last", () => {
    const tiers = [tier("A", ["a", "b", "missing"])];
    const [ranked] = rankLadderNight(tiers, [game("a", "b", 21, 14)]);
    expect(ranked.rankedTeamIds).toHaveLength(3);
    expect(ranked.rankedTeamIds.at(-1)).toBe("missing");
  });

  it("returns every tier even when no games were played", () => {
    const tiers = [tier("A", ["a", "b"]), tier("B", ["c", "d"])];
    const ranked = rankLadderNight(tiers, []);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].rankedTeamIds.sort()).toEqual(["a", "b"]);
  });
});
