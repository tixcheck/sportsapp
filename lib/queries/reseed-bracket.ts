import { createClient } from "@/lib/supabase/server";
import { matchWinner } from "@/lib/scheduler/tiebreakers";

export interface ReseedMatchView {
  id: string;
  round: number;
  homeTeamId: string | null;
  homeName: string | null;
  homeSeed: number | null;
  awayTeamId: string | null;
  awayName: string | null;
  awaySeed: number | null;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamId: string | null;
  status: string;
  court: string | null;
  scheduledAt: string | null;
}

export interface ReseedBracketView {
  /** Matches grouped by round (round 1 first). */
  rounds: ReseedMatchView[][];
  championTeamId: string | null;
  championName: string | null;
  /** The pending next round hasn't been drawn yet (waiting on the current one). */
  nextRoundPending: boolean;
}

const ROUND_NAME = ["Final", "Semifinals", "Quarterfinals"];

/** Human round label given how many rounds remain after this one. */
export function reseedRoundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round; // 0 = final
  return ROUND_NAME[fromEnd] ?? `Round ${round}`;
}

/**
 * The re-seeding playoff bracket for a competition, round by round. Returns null
 * when the competition isn't a re-seed bracket (no bracket_reseed_seeds). The
 * champion is the lone surviving entrant once every drawn round is complete.
 */
export async function getReseedBracket(
  competitionId: string,
): Promise<ReseedBracketView | null> {
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from("competitions")
    .select("bracket_reseed_seeds")
    .eq("id", competitionId)
    .single();
  const entrants = (comp?.bracket_reseed_seeds as string[] | null) ?? null;
  if (!entrants || entrants.length === 0) return null;

  const { data: matchData } = await supabase
    .from("matches")
    .select(
      "id, round, home_team_id, away_team_id, status, court, scheduled_at",
    )
    .eq("competition_id", competitionId)
    .not("bracket_position", "is", null)
    .order("round", { ascending: true })
    .order("bracket_position", { ascending: true });
  const rows = matchData ?? [];

  const teamIds = [
    ...new Set(
      rows.flatMap((m) => [m.home_team_id, m.away_team_id]).filter(Boolean),
    ),
  ] as string[];
  const { data: teams } = teamIds.length
    ? await supabase.from("teams").select("id, name").in("id", teamIds)
    : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map((teams ?? []).map((t) => [t.id, t.name]));

  const matchIds = rows.map((m) => m.id as string);
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
    const list = setsByMatch.get(s.match_id as string) ?? [];
    list.push({ home: s.home_score as number, away: s.away_score as number });
    setsByMatch.set(s.match_id as string, list);
  }

  const seedOf = new Map(entrants.map((id, i) => [id, i + 1]));
  const losers = new Set<string>();

  const byRound = new Map<number, ReseedMatchView[]>();
  for (const m of rows) {
    const round = (m.round as number) ?? 1;
    const home = m.home_team_id as string | null;
    const away = m.away_team_id as string | null;
    const setList = setsByMatch.get(m.id as string) ?? [];
    let homeScore: number | null = null;
    let awayScore: number | null = null;
    let winner: string | null = null;
    if (setList.length && home && away) {
      homeScore = setList.filter((s) => s.home > s.away).length;
      awayScore = setList.filter((s) => s.away > s.home).length;
      winner = matchWinner({
        homeTeamId: home,
        awayTeamId: away,
        sets: setList,
      });
      if (winner) losers.add(winner === home ? away : home);
    }
    const view: ReseedMatchView = {
      id: m.id as string,
      round,
      homeTeamId: home,
      homeName: home ? (nameOf.get(home) ?? null) : null,
      homeSeed: home ? (seedOf.get(home) ?? null) : null,
      awayTeamId: away,
      awayName: away ? (nameOf.get(away) ?? null) : null,
      awaySeed: away ? (seedOf.get(away) ?? null) : null,
      homeScore,
      awayScore,
      winnerTeamId: winner,
      status: m.status as string,
      court: (m.court as string | null) ?? null,
      scheduledAt: (m.scheduled_at as string | null) ?? null,
    };
    const list = byRound.get(round) ?? [];
    list.push(view);
    byRound.set(round, list);
  }

  const rounds = [...byRound.keys()]
    .sort((a, b) => a - b)
    .map((r) => byRound.get(r)!);

  const survivors = entrants.filter((id) => !losers.has(id));
  const championTeamId = survivors.length === 1 ? survivors[0] : null;
  const drawnComplete =
    rows.length > 0 && rows.every((m) => m.status === "completed");
  const nextRoundPending = drawnComplete && !championTeamId;

  return {
    rounds,
    championTeamId,
    championName: championTeamId ? (nameOf.get(championTeamId) ?? null) : null,
    nextRoundPending,
  };
}
