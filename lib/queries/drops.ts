import { createClient } from "@/lib/supabase/server";

/** One of a team's pool games it could drop, with a readable label. */
export interface DropGameOption {
  matchId: string;
  label: string;
}

export interface DropTeamView {
  teamId: string;
  teamName: string;
  poolName: string;
  droppedMatchId: string | null;
  games: DropGameOption[];
}

export interface DropState {
  /** Teams in a needs_drop pool — empty if no pool is flagged. */
  teams: DropTeamView[];
  /** Every flagged team has chosen a game to drop. */
  complete: boolean;
}

/**
 * The drop-a-game picker state for a tournament: every team in a needs_drop
 * pool, the games it can drop (its own pool games), and its current choice.
 */
export async function getDropState(competitionId: string): Promise<DropState> {
  const supabase = await createClient();

  const { data: pools } = await supabase
    .from("pools")
    .select("id, name")
    .eq("competition_id", competitionId)
    .eq("needs_drop", true);
  if (!pools || pools.length === 0) return { teams: [], complete: true };

  const poolIds = pools.map((p) => p.id);
  const poolName = new Map(
    pools.map((p) => [p.id as string, p.name as string]),
  );

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, pool_id, dropped_match_id")
    .in("pool_id", poolIds);
  const { data: matches } = await supabase
    .from("matches")
    .select("id, pool_id, home_team_id, away_team_id, status")
    .in("pool_id", poolIds);

  const matchIds = (matches ?? []).map((m) => m.id);
  const { data: sets } = matchIds.length
    ? await supabase
        .from("sets")
        .select("match_id, home_score, away_score")
        .in("match_id", matchIds)
    : {
        data: [] as {
          match_id: string;
          home_score: number;
          away_score: number;
        }[],
      };

  const won = new Map<string, { home: number; away: number }>();
  for (const s of sets ?? []) {
    const t = won.get(s.match_id) ?? { home: 0, away: 0 };
    if (s.home_score > s.away_score) t.home += 1;
    else if (s.away_score > s.home_score) t.away += 1;
    won.set(s.match_id, t);
  }
  const teamName = new Map(
    (teams ?? []).map((t) => [t.id as string, t.name as string]),
  );

  const result: DropTeamView[] = (teams ?? []).map((team) => {
    const games: DropGameOption[] = (matches ?? [])
      .filter(
        (m) =>
          m.pool_id === team.pool_id &&
          (m.home_team_id === team.id || m.away_team_id === team.id),
      )
      .map((m) => {
        const isHome = m.home_team_id === team.id;
        const oppId = isHome ? m.away_team_id : m.home_team_id;
        const opp = oppId ? (teamName.get(oppId) ?? "—") : "—";
        const t = won.get(m.id);
        const score = t
          ? isHome
            ? `${t.home}–${t.away}`
            : `${t.away}–${t.home}`
          : "not played";
        return { matchId: m.id, label: `vs ${opp} · ${score}` };
      });
    return {
      teamId: team.id,
      teamName: team.name,
      poolName: poolName.get(team.pool_id ?? "") ?? "",
      droppedMatchId: team.dropped_match_id,
      games,
    };
  });

  return { teams: result, complete: result.every((t) => !!t.droppedMatchId) };
}
