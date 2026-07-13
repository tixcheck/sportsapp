/**
 * Standings loader + cache writer (Phase 7). The pure ranking lives in
 * lib/scheduler/tiebreakers.ts; this turns DB rows into its inputs and back.
 *
 * Edge cases are handled here, by what we feed the pure function:
 *  - Only `completed` matches count — `scheduled`, `in_progress` (pending
 *    confirmation), and `cancelled`/expunged are excluded.
 *  - Every team in scope is included, even `withdrawn` ones — they appear with
 *    exactly their recorded results (the UI badges the row).
 *
 * Standings are derived live for display (never the source of truth);
 * recomputeStandings() additionally upserts the cache on score commit, which is
 * what the Phase 8 bracket seeding reads.
 */
import { createClient } from "@/lib/supabase/server";
import {
  headToHeadTable,
  rankStandings,
  type DroppedByTeam,
  type MatchResult,
  type RankMode,
  type StandingRow,
} from "@/lib/scheduler/tiebreakers";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/** One line in the OVA-style tiebreaker modal. */
export interface ExplainerEntry {
  teamName: string;
  /** e.g. "2 / 3 = 0.6666666666666666" or "2 wins". */
  detail: string;
  /** True for the row whose pill was tapped. */
  highlighted: boolean;
}

export interface TiebreakerExplainer {
  step: number;
  heading: string;
  entries: ExplainerEntry[];
}

export interface StandingsRowView extends StandingRow {
  teamName: string;
  withdrawn: boolean;
  /** Total pool-play / season games scheduled for this team (any status). */
  gamesScheduled: number;
  explainer: TiebreakerExplainer;
}

function fmtRatio(value: number): string {
  return Number.isFinite(value) ? String(value) : "∞";
}

/**
 * Build the OVA-style explanation for one row: the teams it tied with and their
 * values at the step that resolved the tie. Reproduces the reference modal.
 */
function buildExplainer(
  row: StandingRow,
  ranked: StandingRow[],
  results: MatchResult[],
  teamName: Map<string, string>,
  droppedByTeam: DroppedByTeam,
): TiebreakerExplainer {
  const tied = new Set(row.tiedWith);
  const ordered = ranked.filter((r) => tied.has(r.teamId)); // finishing order
  const name = (id: string) => teamName.get(id) ?? "—";
  const entry = (r: StandingRow, detail: string): ExplainerEntry => ({
    teamName: name(r.teamId),
    detail,
    highlighted: r.teamId === row.teamId,
  });

  switch (row.tiebreakerStep) {
    case 1:
      return {
        step: 1,
        heading:
          ordered.length > 1
            ? "Sorting tied teams by match wins."
            : "Ranked outright by match wins.",
        entries: ordered.map((r) => {
          const w = r.mw + 0.5 * r.mt; // wins + half per tie
          return entry(r, `${w} ${w === 1 ? "win" : "wins"}`);
        }),
      };
    case 2: {
      const h2h = new Map(
        headToHeadTable([...tied], results, droppedByTeam).map((e) => [
          e.teamId,
          e,
        ]),
      );
      return {
        step: 2,
        heading:
          "Sorting teams by (matches won / played) between the tied teams.",
        entries: ordered.map((r) => {
          const e = h2h.get(r.teamId)!;
          return entry(r, `${e.wins} / ${e.played} = ${fmtRatio(e.ratio)}`);
        }),
      };
    }
    case 3:
      return {
        step: 3,
        heading: "Sorting tied teams by set ratio (sets won / sets lost).",
        entries: ordered.map((r) =>
          entry(r, `${r.sw} / ${r.sl} = ${fmtRatio(r.setRatio)}`),
        ),
      };
    case 4:
      return {
        step: 4,
        heading: "Sorting tied teams by point ratio (points for / against).",
        entries: ordered.map((r) =>
          entry(r, `${r.pf} / ${r.pa} = ${fmtRatio(r.pointRatio)}`),
        ),
      };
    default:
      return {
        step: 5,
        heading:
          "Tied through every tiebreaker — resolved by coin flip / organizer decision (TBD).",
        entries: ordered.map((r) => entry(r, "tied")),
      };
  }
}

export interface StandingsGroup {
  /** Null for a league (whole-competition standings). */
  poolId: string | null;
  poolName: string | null;
  divisionId: string | null;
  divisionName: string | null;
  rows: StandingsRowView[];
}

type TeamRow = {
  id: string;
  name: string;
  status: string;
  pool_id: string | null;
  division_id: string | null;
  dropped_match_id: string | null;
};
type MatchRow = {
  id: string;
  pool_id: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
};
type ScheduledRow = {
  pool_id: string | null;
  bracket_position: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
};

/**
 * Compute standings for a competition — one group for a league, one per pool for
 * a tournament — deriving live from completed matches + sets.
 */
/** Convenience for server components: derive standings live for display. */
export async function getStandings(
  competitionId: string,
): Promise<StandingsGroup[]> {
  const supabase = await createClient();
  return loadStandings(supabase, competitionId);
}

export async function loadStandings(
  supabase: SupabaseServer,
  competitionId: string,
): Promise<StandingsGroup[]> {
  const { data: comp } = await supabase
    .from("competitions")
    .select("type")
    .eq("id", competitionId)
    .single();
  if (!comp) return [];

  // Leagues may rank by point differential instead of the OVA ratios.
  let mode: RankMode = "ova";
  if (comp.type === "league") {
    const { data: ls } = await supabase
      .from("league_settings")
      .select("tiebreaker")
      .eq("competition_id", competitionId)
      .single();
    if (ls?.tiebreaker === "differential") mode = "differential";
  }

  const { data: teamsData } = await supabase
    .from("teams")
    .select("id, name, status, pool_id, division_id, dropped_match_id")
    .eq("competition_id", competitionId);
  const teams = (teamsData ?? []) as TeamRow[];
  if (teams.length === 0) return [];

  const { data: matchesData } = await supabase
    .from("matches")
    .select("id, pool_id, home_team_id, away_team_id")
    .eq("competition_id", competitionId)
    .eq("status", "completed");
  const matches = (matchesData ?? []) as MatchRow[];

  // Every scheduled match (any status) to count each team's total games. Scoped
  // to pool play / the season — bracket matches (bracket_position set) don't
  // count toward the round-robin games-scheduled figure.
  const { data: allMatchesData } = await supabase
    .from("matches")
    .select("pool_id, bracket_position, home_team_id, away_team_id")
    .eq("competition_id", competitionId);
  const allMatches = (allMatchesData ?? []) as ScheduledRow[];
  const countScheduled = (
    keep: (m: ScheduledRow) => boolean,
  ): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const m of allMatches) {
      if (!keep(m)) continue;
      for (const id of [m.home_team_id, m.away_team_id]) {
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  };

  const matchIds = matches.map((m) => m.id);
  const { data: sets } = matchIds.length
    ? await supabase
        .from("sets")
        .select("match_id, set_number, home_score, away_score")
        .in("match_id", matchIds)
        .order("set_number", { ascending: true })
    : {
        data: [] as {
          match_id: string;
          home_score: number;
          away_score: number;
        }[],
      };

  const setsByMatch = new Map<string, { home: number; away: number }[]>();
  for (const s of sets ?? []) {
    const list = setsByMatch.get(s.match_id) ?? [];
    list.push({ home: s.home_score, away: s.away_score });
    setsByMatch.set(s.match_id, list);
  }

  const toResult = (m: MatchRow): MatchResult | null =>
    m.home_team_id && m.away_team_id
      ? {
          matchId: m.id,
          homeTeamId: m.home_team_id,
          awayTeamId: m.away_team_id,
          sets: setsByMatch.get(m.id) ?? [],
        }
      : null;

  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const isWithdrawn = new Map(
    teams.map((t) => [t.id, t.status === "withdrawn"]),
  );
  // The "drop a game" rule (v1): team → the one match it excludes from its own
  // standings. Only set on teams in a needs_drop pool; honored wherever a team's
  // record is tallied (rankStandings + the tiebreaker explainer).
  const droppedByTeam: DroppedByTeam = new Map(
    teams
      .filter((t) => t.dropped_match_id)
      .map((t) => [t.id, t.dropped_match_id as string]),
  );
  const rank = (
    teamIds: string[],
    results: MatchResult[],
    scheduledByTeam: Map<string, number>,
  ): StandingsRowView[] => {
    const ranked = rankStandings(teamIds, results, droppedByTeam, mode);
    return ranked.map((r) => ({
      ...r,
      teamName: teamName.get(r.teamId) ?? "—",
      withdrawn: isWithdrawn.get(r.teamId) ?? false,
      gamesScheduled: scheduledByTeam.get(r.teamId) ?? 0,
      explainer: buildExplainer(r, ranked, results, teamName, droppedByTeam),
    }));
  };

  if (comp.type === "league") {
    const teamIds = teams.map((t) => t.id);
    const results = matches
      .map(toResult)
      .filter((r): r is MatchResult => r !== null);
    // Season games only (exclude the playoff bracket).
    const scheduled = countScheduled((m) => m.bracket_position === null);
    return [
      {
        poolId: null,
        poolName: null,
        divisionId: null,
        divisionName: null,
        rows: rank(teamIds, results, scheduled),
      },
    ];
  }

  // Tournament: standings per pool, ordered by the pool's sort_order.
  const [{ data: pools }, { data: divisions }] = await Promise.all([
    supabase
      .from("pools")
      .select("id, name, division_id, sort_order")
      .eq("competition_id", competitionId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("divisions")
      .select("id, name")
      .eq("competition_id", competitionId),
  ]);
  const divName = new Map((divisions ?? []).map((d) => [d.id, d.name]));

  const groups: StandingsGroup[] = [];
  for (const p of pools ?? []) {
    const teamIds = teams.filter((t) => t.pool_id === p.id).map((t) => t.id);
    if (teamIds.length === 0) continue;
    const results = matches
      .filter((m) => m.pool_id === p.id)
      .map(toResult)
      .filter((r): r is MatchResult => r !== null);
    const scheduled = countScheduled((m) => m.pool_id === p.id);
    groups.push({
      poolId: p.id,
      poolName: p.name,
      divisionId: p.division_id,
      divisionName: p.division_id ? (divName.get(p.division_id) ?? null) : null,
      rows: rank(teamIds, results, scheduled),
    });
  }
  return groups;
}

/**
 * Recompute and upsert the standings_cache for a competition. Called right after
 * a score is committed. Delete-then-insert because positions shift wholesale.
 * Non-finite ratios (an unbeaten team's SL=0) are stored as null — the cache is
 * a convenience artifact; seeding recomputes live.
 */
export async function recomputeStandings(
  supabase: SupabaseServer,
  competitionId: string,
): Promise<void> {
  const groups = await loadStandings(supabase, competitionId);

  await supabase
    .from("standings_cache")
    .delete()
    .eq("competition_id", competitionId);

  const rows = groups.flatMap((g) =>
    g.rows.map((r) => ({
      competition_id: competitionId,
      pool_id: g.poolId,
      division_id: g.divisionId,
      team_id: r.teamId,
      mw: r.mw,
      ml: r.ml,
      sw: r.sw,
      sl: r.sl,
      pf: r.pf,
      pa: r.pa,
      set_ratio: Number.isFinite(r.setRatio) ? r.setRatio : null,
      point_ratio: Number.isFinite(r.pointRatio) ? r.pointRatio : null,
      position: r.position,
      tiebreaker_step: r.tiebreakerStep,
    })),
  );
  if (rows.length) {
    await supabase.from("standings_cache").insert(rows);
  }
}
