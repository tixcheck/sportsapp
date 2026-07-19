/**
 * Standings tiebreakers — the OVA hierarchy (PRD §8). Pure: no DB access.
 *
 * Order of resolution within a group of teams tied on the prior criteria:
 *   1. Match wins (descending)
 *   2. Head-to-head: wins / played among the *tied subset only*
 *   3. Set ratio   (SW / SL across all matches in scope)
 *   4. Point ratio (PF / PA across all matches in scope)
 *   5. Unresolved  → coin flip / organizer decision ("TBD")
 *
 * Steps 3 and 4 use each team's overall ratios (the same SW/SL, PF/PA shown in
 * the standings table); at every step we only compare the still-tied subset, so
 * a circular head-to-head (A>B>C>A, all 0.5) simply fails to separate and falls
 * through to set ratio. Each returned row records which step resolved it.
 */

export type TeamId = string;

export interface SetScore {
  home: number;
  away: number;
}

export interface MatchResult {
  /** Match identity — only needed to apply per-team drops (see DroppedByTeam). */
  matchId?: string;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  /** Set scores in order. Empty is allowed (e.g. an unplayed forfeit). */
  sets: SetScore[];
  /** If set, this team forfeited; the opponent is awarded the match win. */
  forfeitedBy?: TeamId | null;
}

/**
 * The "drop a game" rule (v1): a team → the one match id it excludes from ITS
 * OWN record. The dropped match still counts for the opponent — exclusion is
 * strictly per-team. Absent/empty ⇒ every game counts (the default).
 */
export type DroppedByTeam = ReadonlyMap<TeamId, string>;

/** Whether `teamId` drops match `m` from its own tally. */
function isDropped(
  droppedByTeam: DroppedByTeam | undefined,
  teamId: TeamId,
  m: MatchResult,
): boolean {
  return m.matchId != null && droppedByTeam?.get(teamId) === m.matchId;
}

export interface TeamStats {
  teamId: TeamId;
  /** Matches won / lost. */
  mw: number;
  ml: number;
  /** Matches tied — a 2-set game ending 1–1. Counts as half a win in ranking. */
  mt: number;
  /** Sets won / lost. */
  sw: number;
  sl: number;
  /** Points for / against. */
  pf: number;
  pa: number;
  /** SW / SL. 0 when no sets played; Infinity when SL is 0 but SW > 0. */
  setRatio: number;
  /** PF / PA. 0 when no points; Infinity when PA is 0 but PF > 0. */
  pointRatio: number;
}

export type TiebreakerStep = 1 | 2 | 3 | 4 | 5;

/**
 * Which hierarchy to rank by:
 *  - "ova": match wins → head-to-head → set ratio → point ratio (the default).
 *  - "differential": match wins → head-to-head → point differential (PF − PA);
 *    steps 3 and 4 both use point differential, so a further tie is unresolved.
 *    Used by leagues whose rules rank on point differential rather than ratios.
 */
export type RankMode = "ova" | "differential";

/**
 * Optional normalization for teams that have played fewer games than the rest
 * (e.g. a pair that joined mid-season). When set, a team below `targetGames` has
 * its ranking values (match wins, and point differential in differential mode)
 * pro-rated up to `targetGames` — so it's compared on the same slate length as
 * everyone else. It only takes effect once a team has played `minGames`, so an
 * early hot start (1–0 → projected 12–0) can't distort the table. Ratios (set /
 * point ratio) are already per-game, so they're never pro-rated. This changes
 * ranking only; the row's actual mw/ml/etc. are untouched, and `projected`
 * flags which rows were normalized.
 */
export interface RankProjection {
  targetGames: number;
  minGames: number;
}

export interface StandingRow extends TeamStats {
  position: number;
  /** True when this team's ranking values were pro-rated (see RankProjection). */
  projected: boolean;
  /** Step (1–5) that resolved this team's position vs the teams it tied with. */
  tiebreakerStep: TiebreakerStep;
  /** The numeric value used at the resolving step (mw, h2h ratio, etc.). */
  tiebreakerValue: number;
  /**
   * The teams this row was tied with entering its resolving step — i.e. all
   * teams equal on every earlier criterion (includes this team). Just `[teamId]`
   * when the team was never tied (resolved outright at match wins). Powers the
   * OVA-style tiebreaker modal: list these teams' values at the resolving step.
   */
  tiedWith: TeamId[];
  /** Human-facing summary of the resolving comparison. */
  explanation: string;
}

export interface HeadToHeadEntry {
  teamId: TeamId;
  wins: number;
  played: number;
  ratio: number;
}

// --- match math ------------------------------------------------------------

function tally(match: MatchResult) {
  let homeSets = 0;
  let awaySets = 0;
  let homePoints = 0;
  let awayPoints = 0;
  for (const s of match.sets) {
    homePoints += s.home;
    awayPoints += s.away;
    if (s.home > s.away) homeSets += 1;
    else if (s.away > s.home) awaySets += 1;
  }
  return { homeSets, awaySets, homePoints, awayPoints };
}

/** The winning team id, or null if the match has no decided winner. */
export function matchWinner(match: MatchResult): TeamId | null {
  if (match.forfeitedBy) {
    return match.forfeitedBy === match.homeTeamId
      ? match.awayTeamId
      : match.homeTeamId;
  }
  const { homeSets, awaySets } = tally(match);
  if (homeSets > awaySets) return match.homeTeamId;
  if (awaySets > homeSets) return match.awayTeamId;
  return null;
}

function ratio(num: number, den: number): number {
  if (den === 0) return num > 0 ? Infinity : 0;
  return num / den;
}

/**
 * Aggregate stats for each team across the matches in scope. Only matches
 * where both teams are in `teamIds` are counted.
 */
export function computeStats(
  teamIds: TeamId[],
  matches: MatchResult[],
  droppedByTeam?: DroppedByTeam,
): Map<TeamId, TeamStats> {
  const stats = new Map<TeamId, TeamStats>();
  for (const id of teamIds) {
    stats.set(id, {
      teamId: id,
      mw: 0,
      ml: 0,
      mt: 0,
      sw: 0,
      sl: 0,
      pf: 0,
      pa: 0,
      setRatio: 0,
      pointRatio: 0,
    });
  }

  for (const match of matches) {
    const home = stats.get(match.homeTeamId);
    const away = stats.get(match.awayTeamId);
    if (!home || !away) continue;

    // A dropped match contributes nothing to the dropping side, but is tallied
    // normally for the opponent — exclusion is per-team, not per-match.
    const homeOut = isDropped(droppedByTeam, match.homeTeamId, match);
    const awayOut = isDropped(droppedByTeam, match.awayTeamId, match);

    const { homeSets, awaySets, homePoints, awayPoints } = tally(match);
    if (!homeOut) {
      home.sw += homeSets;
      home.sl += awaySets;
      home.pf += homePoints;
      home.pa += awayPoints;
    }
    if (!awayOut) {
      away.sw += awaySets;
      away.sl += homeSets;
      away.pf += awayPoints;
      away.pa += homePoints;
    }

    const winner = matchWinner(match);
    if (winner === match.homeTeamId) {
      if (!homeOut) home.mw += 1;
      if (!awayOut) away.ml += 1;
    } else if (winner === match.awayTeamId) {
      if (!awayOut) away.mw += 1;
      if (!homeOut) home.ml += 1;
    } else if (homeSets === awaySets && homeSets > 0) {
      // A played 2-set game ending 1–1 is a tie — half a win for each side.
      if (!homeOut) home.mt += 1;
      if (!awayOut) away.mt += 1;
    }
  }

  for (const s of stats.values()) {
    s.setRatio = ratio(s.sw, s.sl);
    s.pointRatio = ratio(s.pf, s.pa);
  }
  return stats;
}

/**
 * Head-to-head table among a subset of teams: wins and matches played counting
 * only matches between members of `teamIds`. Reproduces the OVA modal numbers.
 */
export function headToHeadTable(
  teamIds: TeamId[],
  matches: MatchResult[],
  droppedByTeam?: DroppedByTeam,
): HeadToHeadEntry[] {
  const subset = new Set(teamIds);
  const wins = new Map<TeamId, number>(teamIds.map((id) => [id, 0]));
  const played = new Map<TeamId, number>(teamIds.map((id) => [id, 0]));

  for (const match of matches) {
    if (!subset.has(match.homeTeamId) || !subset.has(match.awayTeamId))
      continue;
    // Same per-team rule as computeStats: a dropped game isn't counted for the
    // dropping side (not even here), but remains the opponent's win/played.
    const homeOut = isDropped(droppedByTeam, match.homeTeamId, match);
    const awayOut = isDropped(droppedByTeam, match.awayTeamId, match);
    if (!homeOut)
      played.set(match.homeTeamId, played.get(match.homeTeamId)! + 1);
    if (!awayOut)
      played.set(match.awayTeamId, played.get(match.awayTeamId)! + 1);
    const winner = matchWinner(match);
    if (winner) {
      if (!isDropped(droppedByTeam, winner, match))
        wins.set(winner, wins.get(winner)! + 1);
    } else {
      // A head-to-head tie (2-set, 1–1) is half a win for each side.
      let h = 0;
      let a = 0;
      for (const s of match.sets) {
        if (s.home > s.away) h += 1;
        else if (s.away > s.home) a += 1;
      }
      if (h > 0 && h === a) {
        if (!homeOut)
          wins.set(match.homeTeamId, wins.get(match.homeTeamId)! + 0.5);
        if (!awayOut)
          wins.set(match.awayTeamId, wins.get(match.awayTeamId)! + 0.5);
      }
    }
  }

  return teamIds.map((id) => {
    const w = wins.get(id)!;
    const p = played.get(id)!;
    return { teamId: id, wins: w, played: p, ratio: p === 0 ? 0 : w / p };
  });
}

// --- ranking ---------------------------------------------------------------

function approxEqual(a: number, b: number): boolean {
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) < 1e-9;
}

/** Descending comparator that handles Infinity safely. */
function compareDesc(a: number, b: number): number {
  if (approxEqual(a, b)) return 0;
  return a > b ? -1 : 1;
}

type Ranked = {
  teamId: TeamId;
  step: TiebreakerStep;
  value: number;
  tiedWith: TeamId[];
};

function gamesPlayed(s: TeamStats): number {
  return s.mw + s.ml + s.mt;
}

/**
 * Factor to pro-rate a team's totals up to the full slate. 1 (no change) unless
 * projection is on and the team has played at least `minGames` but fewer than
 * `targetGames` — then targetGames / gamesPlayed.
 */
function projectionFactor(s: TeamStats, projection?: RankProjection): number {
  if (!projection) return 1;
  const g = gamesPlayed(s);
  if (g >= projection.minGames && g > 0 && g < projection.targetGames) {
    return projection.targetGames / g;
  }
  return 1;
}

function valuerFor(
  step: TiebreakerStep,
  mode: RankMode,
  group: TeamId[],
  stats: Map<TeamId, TeamStats>,
  matches: MatchResult[],
  droppedByTeam?: DroppedByTeam,
  projection?: RankProjection,
): (id: TeamId) => number {
  if (step === 2) {
    const table = new Map(
      headToHeadTable(group, matches, droppedByTeam).map((e) => [
        e.teamId,
        e.ratio,
      ]),
    );
    return (id) => table.get(id)!;
  }
  return (id) => {
    const s = stats.get(id)!;
    // Match wins and point differential are totals, so a short-handed team is
    // pro-rated up to the full slate; ratios are already per-game.
    if (step === 1)
      return projectionFactor(s, projection) * (s.mw + 0.5 * s.mt);
    if (mode === "differential") {
      return projectionFactor(s, projection) * (s.pf - s.pa);
    }
    if (step === 3) return s.setRatio;
    return s.pointRatio; // step 4
  };
}

function resolveGroup(
  group: TeamId[],
  fromStep: TiebreakerStep,
  mode: RankMode,
  stats: Map<TeamId, TeamStats>,
  matches: MatchResult[],
  droppedByTeam?: DroppedByTeam,
  projection?: RankProjection,
): Ranked[] {
  if (group.length === 1) {
    const value = valuerFor(
      fromStep,
      mode,
      group,
      stats,
      matches,
      droppedByTeam,
      projection,
    )(group[0]);
    return [{ teamId: group[0], step: fromStep, value, tiedWith: [group[0]] }];
  }

  for (let s = fromStep; s <= 4; s++) {
    const step = s as TiebreakerStep;
    const valueOf = valuerFor(
      step,
      mode,
      group,
      stats,
      matches,
      droppedByTeam,
      projection,
    );
    const sorted = [...group].sort((a, b) =>
      compareDesc(valueOf(a), valueOf(b)),
    );

    const buckets: { value: number; teams: TeamId[] }[] = [];
    for (const id of sorted) {
      const v = valueOf(id);
      const last = buckets[buckets.length - 1];
      if (last && approxEqual(last.value, v)) last.teams.push(id);
      else buckets.push({ value: v, teams: [id] });
    }

    if (buckets.length > 1) {
      const out: Ranked[] = [];
      for (const b of buckets) {
        if (b.teams.length === 1) {
          // `step > 1` means the group was tied on every earlier criterion, so
          // this team genuinely tied with the rest of `group`; at step 1 a
          // unique match-win count is an outright rank, not a tie.
          out.push({
            teamId: b.teams[0],
            step,
            value: b.value,
            tiedWith: step > 1 ? [...group] : [b.teams[0]],
          });
        } else {
          out.push(
            ...resolveGroup(
              b.teams,
              (s + 1) as TiebreakerStep,
              mode,
              stats,
              matches,
              droppedByTeam,
              projection,
            ),
          );
        }
      }
      return out;
    }
  }

  // Nothing separated the group through point ratio → unresolved (all tied).
  return group.map((id) => ({
    teamId: id,
    step: 5 as TiebreakerStep,
    value: NaN,
    tiedWith: [...group],
  }));
}

function formatRatio(value: number): string {
  return Number.isFinite(value) ? String(value) : "∞";
}

function explain(
  step: TiebreakerStep,
  mode: RankMode,
  value: number,
  s: TeamStats,
): string {
  switch (step) {
    case 1:
      return `Match wins: ${s.mw + 0.5 * s.mt}`;
    case 2:
      return `Head-to-head among tied teams: ${formatRatio(value)}`;
    case 3:
    case 4:
      if (mode === "differential") {
        const diff = s.pf - s.pa;
        return `Point differential ${s.pf}−${s.pa} = ${diff >= 0 ? "+" : ""}${diff}`;
      }
      return step === 3
        ? `Set ratio ${s.sw}/${s.sl} = ${formatRatio(s.setRatio)}`
        : `Point ratio ${s.pf}/${s.pa} = ${formatRatio(s.pointRatio)}`;
    case 5:
      return "Unresolved — coin flip / organizer decision (TBD)";
  }
}

/**
 * Rank teams using the full OVA hierarchy. Returns rows in finishing order,
 * each annotated with the step that resolved its position. `teamIds` defines
 * the scope; ties beyond stats fall back to the input order for stability.
 */
export function rankStandings(
  teamIds: TeamId[],
  matches: MatchResult[],
  droppedByTeam?: DroppedByTeam,
  mode: RankMode = "ova",
  projection?: RankProjection,
): StandingRow[] {
  const stats = computeStats(teamIds, matches, droppedByTeam);

  // A team that hasn't played yet ranks below every team that has. Otherwise a
  // neutral record (0 wins, 0 point differential) would outrank a team that
  // competed and earned a *negative* differential — so unplayed teams would
  // float above teams that played and lost. Rank only the played teams through
  // the hierarchy; append the unplayed ones (indistinguishable) at the bottom.
  const played = teamIds.filter((id) => gamesPlayed(stats.get(id)!) > 0);
  const unplayed = teamIds.filter((id) => gamesPlayed(stats.get(id)!) === 0);

  const ranked = resolveGroup(
    played,
    1,
    mode,
    stats,
    matches,
    droppedByTeam,
    projection,
  );
  const rankedUnplayed: Ranked[] = unplayed.map((id) => ({
    teamId: id,
    step: 1,
    value: 0,
    tiedWith: unplayed.length > 1 ? [...unplayed] : [id],
  }));

  return [...ranked, ...rankedUnplayed].map((r, i) => {
    const s = stats.get(r.teamId)!;
    return {
      ...s,
      position: i + 1,
      projected: projectionFactor(s, projection) !== 1,
      tiebreakerStep: r.step,
      tiebreakerValue: r.value,
      tiedWith: r.tiedWith,
      explanation: explain(r.step, mode, r.value, s),
    };
  });
}

/**
 * Seed order across pools for a single-elimination bracket (Phase 8 consumes
 * this; built + tested here to prove the ratio normalization). Takes each pool's
 * already-ranked standings and interleaves by finishing position — all pool
 * winners first, then all runners-up, and so on — ranking teams within a tier by
 * set ratio then point ratio. Because those are *ratios*, a pool that ran to 15
 * and one that ran to 25 compare on equal footing; raw point totals never leak
 * in. Ties beyond point ratio keep the input pool order for stability.
 */
export function crossPoolSeedOrder(pools: StandingRow[][]): TeamId[] {
  const depth = pools.reduce((max, p) => Math.max(max, p.length), 0);
  const order: TeamId[] = [];
  for (let pos = 0; pos < depth; pos++) {
    const tier = pools
      .map((p) => p[pos])
      .filter((r): r is StandingRow => r !== undefined)
      .sort(
        (a, b) =>
          compareDesc(a.setRatio, b.setRatio) ||
          compareDesc(a.pointRatio, b.pointRatio),
      );
    for (const r of tier) order.push(r.teamId);
  }
  return order;
}

export type AdvancementMode = "perPool" | "overall";

/**
 * The teams that advance to the bracket, in seed order. "perPool" takes the top
 * `n` from each pool; "overall" takes the best `n` across all pools. Both seed
 * via crossPoolSeedOrder, so seeding stays consistent (and format-normalized).
 */
export function selectAdvancers(
  pools: StandingRow[][],
  mode: AdvancementMode,
  n: number,
): TeamId[] {
  if (mode === "perPool") {
    return crossPoolSeedOrder(pools.map((p) => p.slice(0, n)));
  }
  return crossPoolSeedOrder(pools).slice(0, n);
}

/**
 * Detect tied teams straddling the advancement cutoff — the only case where
 * seeding is genuinely ambiguous (an unresolved step-5 tie within a pool, or a
 * cross-pool dead heat on both ratios). Returns the groups of team ids to name
 * in a warning; the organizer can then reorder the seed preview (coin flip)
 * before generating. Empty when the cutoff is clean.
 */
export function advancementCutoffTies(
  pools: StandingRow[][],
  mode: AdvancementMode,
  n: number,
): TeamId[][] {
  const groups: TeamId[][] = [];
  if (mode === "perPool") {
    for (const rows of pools) {
      const last = rows[n - 1];
      const first = rows[n];
      if (
        last &&
        first &&
        last.tiebreakerStep === 5 &&
        first.tiebreakerStep === 5 &&
        last.tiedWith.includes(first.teamId)
      ) {
        groups.push([...new Set([...last.tiedWith, ...first.tiedWith])]);
      }
    }
  } else {
    const order = crossPoolSeedOrder(pools);
    const byId = new Map(pools.flat().map((r) => [r.teamId, r]));
    const a = byId.get(order[n - 1]);
    const b = byId.get(order[n]);
    if (
      a &&
      b &&
      approxEqual(a.setRatio, b.setRatio) &&
      approxEqual(a.pointRatio, b.pointRatio)
    ) {
      groups.push([a.teamId, b.teamId]);
    }
  }
  return groups;
}
