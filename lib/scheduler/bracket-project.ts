/**
 * Live bracket projection (PRD §7/§8). Pure: no DB. From the current standings,
 * it projects the seed order + first-round matchups the bracket WOULD have if
 * pools ended now — reusing the exact seeding (crossPoolSeedOrder /
 * selectAdvancers / splitSeeds) and pairing (dualBracketMatches) the real
 * generation uses, so the preview can't diverge from what generateBracketAction
 * actually persists. The generation panel computes its default seed order from
 * `bracketSeedTracks` too, so panel default and preview are the same code.
 */
import {
  crossPoolSeedOrder,
  selectAdvancers,
  type AdvancementMode,
  type StandingRow,
  type TeamId,
} from "./tiebreakers";
import {
  dualBracketMatches,
  splitSeeds,
  type BracketTrack,
  type TrackedBracketMatch,
} from "./bracket";
import {
  tournamentFormat,
  type FormatTemplate,
} from "@/lib/tournament-formats";

export interface SeedTrackOptions {
  /** Single-elim: how many advance and from where. Defaults perPool / 2. */
  mode?: AdvancementMode;
  n?: number;
  /** champ_consolation split sizes. Default the format's (8 / 7). */
  championship?: number;
  consolation?: number;
}

export interface SeedTracks {
  championship: TeamId[];
  consolation: TeamId[];
}

/**
 * The seed list per track from current standings — the single source of truth
 * for both the generation panel's default order and the live preview.
 */
export function bracketSeedTracks(
  pools: StandingRow[][],
  template: FormatTemplate,
  opts: SeedTrackOptions = {},
): SeedTracks {
  if (template === "champ_consolation") {
    const split = tournamentFormat("champ_consolation").split!;
    const champ = opts.championship ?? split.championship;
    const conso = opts.consolation ?? split.consolation;
    const { championship, consolation } = splitSeeds(
      crossPoolSeedOrder(pools),
      champ,
      conso,
    );
    return { championship, consolation };
  }
  const mode = opts.mode ?? "perPool";
  const n = opts.n ?? 2;
  return { championship: selectAdvancers(pools, mode, n), consolation: [] };
}

export interface ProjectedMatchup {
  teamId: TeamId;
  track: BracketTrack | null;
  seed: number;
  /** Round-1 opponent; null = a bye into round 2. */
  opponentTeamId: TeamId | null;
}

export interface BracketProjection {
  /** Per team that makes a bracket. */
  byTeam: Map<TeamId, ProjectedMatchup>;
  /** Seed lists per track, in seed order. */
  tracks: { track: BracketTrack | null; seeds: TeamId[] }[];
  /**
   * The matches generation would persist (round/position/track/teams, sans
   * court/time) — backs the projected tree and the divergence-lock test.
   */
  matches: TrackedBracketMatch[];
}

/**
 * Project the bracket from seed lists. Calls the SAME dualBracketMatches the
 * generation action persists, so the round-1 matchups are identical by
 * construction. A bye team isn't in any round-1 match → opponentTeamId stays
 * null (it advances into round 2).
 */
export function projectBracket(seeds: SeedTracks): BracketProjection {
  const hasConso = seeds.consolation.length > 0;
  const matches = dualBracketMatches({
    championship: seeds.championship,
    consolation: hasConso ? seeds.consolation : undefined,
  });

  const tracks: { track: BracketTrack | null; seeds: TeamId[] }[] = [
    { track: hasConso ? "championship" : null, seeds: seeds.championship },
    ...(hasConso
      ? [{ track: "consolation" as BracketTrack, seeds: seeds.consolation }]
      : []),
  ];

  const byTeam = new Map<TeamId, ProjectedMatchup>();
  for (const t of tracks) {
    t.seeds.forEach((id, i) =>
      byTeam.set(id, {
        teamId: id,
        track: t.track,
        seed: i + 1,
        opponentTeamId: null,
      }),
    );
  }
  for (const m of matches) {
    if (m.round !== 1 || !m.homeTeamId || !m.awayTeamId) continue;
    byTeam.get(m.homeTeamId)!.opponentTeamId = m.awayTeamId;
    byTeam.get(m.awayTeamId)!.opponentTeamId = m.homeTeamId;
  }

  return { byTeam, tracks, matches };
}
