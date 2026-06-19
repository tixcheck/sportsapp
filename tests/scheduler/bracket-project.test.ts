import { describe, expect, it } from "vitest";

import {
  bracketSeedTracks,
  projectBracket,
  type SeedTracks,
} from "@/lib/scheduler/bracket-project";
import { dualBracketMatches } from "@/lib/scheduler/bracket";
import type { StandingRow } from "@/lib/scheduler/tiebreakers";

/** Minimal ranked row — only the fields seeding reads carry signal. */
function row(teamId: string, position: number, ratio = 1): StandingRow {
  return {
    teamId,
    mw: 0,
    ml: 0,
    mt: 0,
    sw: 0,
    sl: 0,
    pf: 0,
    pa: 0,
    setRatio: ratio,
    pointRatio: ratio,
    position,
    tiebreakerStep: 1,
    tiebreakerValue: 0,
    tiedWith: [teamId],
    explanation: "",
  };
}

/** A ranked pool of `size` teams with strictly descending ratios. */
function pool(prefix: string, size: number, base: number): StandingRow[] {
  return Array.from({ length: size }, (_, i) =>
    row(`${prefix}${i + 1}`, i + 1, base - i * 0.01),
  );
}

/** What generateBracketAction inserts (round/position/track/teams, sans court/time). */
function persistedRound1(seeds: SeedTracks) {
  return dualBracketMatches({
    championship: seeds.championship,
    consolation: seeds.consolation.length ? seeds.consolation : undefined,
  })
    .filter((m) => m.round === 1)
    .map((m) => ({
      bracket_position: m.position,
      bracket_track: m.track,
      home_team_id: m.homeTeamId,
      away_team_id: m.awayTeamId,
    }))
    .sort(
      (a, b) =>
        (a.bracket_track ?? "").localeCompare(b.bracket_track ?? "") ||
        a.bracket_position - b.bracket_position,
    );
}

function projectedRound1(seeds: SeedTracks) {
  return projectBracket(seeds)
    .matches.filter((m) => m.round === 1)
    .map((m) => ({
      bracket_position: m.position,
      bracket_track: m.track,
      home_team_id: m.homeTeamId,
      away_team_id: m.awayTeamId,
    }))
    .sort(
      (a, b) =>
        (a.bracket_track ?? "").localeCompare(b.bracket_track ?? "") ||
        a.bracket_position - b.bracket_position,
    );
}

describe("bracketSeedTracks", () => {
  it("single: top-2 per pool, interleaved cross-pool seed order", () => {
    const pools = [
      [row("a1", 1, 3), row("a2", 2, 2), row("a3", 3, 1), row("a4", 4, 0.5)],
      [
        row("b1", 1, 2.5),
        row("b2", 2, 1.5),
        row("b3", 3, 0.9),
        row("b4", 4, 0.4),
      ],
    ];
    const { championship, consolation } = bracketSeedTracks(pools, "single");
    // pool winners first (by ratio), then runners-up
    expect(championship).toEqual(["a1", "b1", "a2", "b2"]);
    expect(consolation).toEqual([]);
  });

  it("champ_consolation: defaults to the format's 8 / 7 split", () => {
    const pools = [
      pool("a", 4, 9),
      pool("b", 4, 8),
      pool("c", 4, 7),
      pool("d", 4, 6),
    ];
    const { championship, consolation } = bracketSeedTracks(
      pools,
      "champ_consolation",
    );
    expect(championship).toHaveLength(8);
    expect(consolation).toHaveLength(7); // 16 teams → 8 + 7 (one left out)
  });
});

describe("projectBracket", () => {
  it("seeds + first-round matchups for a full 4-team bracket", () => {
    const p = projectBracket({
      championship: ["A", "B", "C", "D"],
      consolation: [],
    });
    expect(p.byTeam.get("A")).toMatchObject({ seed: 1, opponentTeamId: "D" });
    expect(p.byTeam.get("B")).toMatchObject({ seed: 2, opponentTeamId: "C" });
    expect(p.byTeam.get("C")?.opponentTeamId).toBe("B");
    expect(p.byTeam.get("D")?.opponentTeamId).toBe("A");
  });

  it("a top seed with a bye projects no round-1 opponent", () => {
    const p = projectBracket({
      championship: ["A", "B", "C"],
      consolation: [],
    });
    expect(p.byTeam.get("A")).toMatchObject({ seed: 1, opponentTeamId: null }); // bye
    expect(p.byTeam.get("B")?.opponentTeamId).toBe("C");
    expect(p.byTeam.get("C")?.opponentTeamId).toBe("B");
  });

  it("dual tracks carry independent seeds + tags", () => {
    const p = projectBracket({
      championship: ["A", "B", "C", "D"],
      consolation: ["E", "F", "G", "H"],
    });
    expect(p.byTeam.get("A")).toMatchObject({
      track: "championship",
      seed: 1,
      opponentTeamId: "D",
    });
    expect(p.byTeam.get("E")).toMatchObject({
      track: "consolation",
      seed: 1,
      opponentTeamId: "H",
    });
  });
});

describe("divergence lock — projection equals what generation persists", () => {
  it("single: projected round-1 matchups == generateBracketAction's rows", () => {
    const pools = [
      [row("a1", 1, 3), row("a2", 2, 2), row("a3", 3, 1), row("a4", 4, 0.5)],
      [
        row("b1", 1, 2.5),
        row("b2", 2, 1.5),
        row("b3", 3, 0.9),
        row("b4", 4, 0.4),
      ],
    ];
    const seeds = bracketSeedTracks(pools, "single");
    expect(projectedRound1(seeds)).toEqual(persistedRound1(seeds));
  });

  it("champ_consolation: projected round-1 matchups == generateBracketAction's rows", () => {
    const pools = [
      pool("a", 4, 9),
      pool("b", 4, 8),
      pool("c", 4, 7),
      pool("d", 4, 6),
    ];
    const seeds = bracketSeedTracks(pools, "champ_consolation");
    const projected = projectedRound1(seeds);
    const persisted = persistedRound1(seeds);
    expect(projected).toEqual(persisted);
    // sanity: both tracks are actually present in the locked comparison
    expect(new Set(persisted.map((r) => r.bracket_track))).toEqual(
      new Set(["championship", "consolation"]),
    );
  });
});
