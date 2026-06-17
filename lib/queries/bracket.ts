import { createClient } from "@/lib/supabase/server";
import { loadStandings } from "@/lib/standings/compute";
import { crossPoolSeedOrder, matchWinner } from "@/lib/scheduler/tiebreakers";

export interface BracketEntryView {
  teamId: string;
  name: string;
  seed: number | null;
}

export interface BracketMatchView {
  id: string;
  round: number;
  position: number;
  /** null = a slot not yet decided ("winner of …"). */
  home: BracketEntryView | null;
  away: BracketEntryView | null;
  /** Sets won by each side (null until any score is entered). */
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamId: string | null;
  status: string;
}

export interface BracketView {
  /** rounds[0] = first round; last = final. */
  rounds: BracketMatchView[][];
  championTeamId: string | null;
  championName: string | null;
}

/** The bracket for a tournament, shaped for the visual tree (null if none). */
export async function getBracket(
  competitionId: string,
): Promise<BracketView | null> {
  const supabase = await createClient();

  const { data: matches } = await supabase
    .from("matches")
    .select("id, round, bracket_position, home_team_id, away_team_id, status")
    .eq("competition_id", competitionId)
    .not("bracket_position", "is", null)
    .order("round", { ascending: true })
    .order("bracket_position", { ascending: true });
  if (!matches || matches.length === 0) return null;

  const matchIds = matches.map((m) => m.id);
  const teamIds = [
    ...new Set(
      matches.flatMap((m) => [m.home_team_id, m.away_team_id]).filter(Boolean),
    ),
  ] as string[];

  const [{ data: teams }, { data: sets }] = await Promise.all([
    supabase.from("teams").select("id, name").in("id", teamIds),
    supabase
      .from("sets")
      .select("match_id, home_score, away_score")
      .in("match_id", matchIds),
  ]);
  const teamName = new Map(
    (teams ?? []).map((t) => [t.id as string, t.name as string]),
  );

  // Seeds: rank the bracket teams by the same cross-pool order used to seed.
  const groups = await loadStandings(supabase, competitionId);
  const fullOrder = crossPoolSeedOrder(groups.map((g) => g.rows));
  const bracketTeams = new Set(teamIds);
  const seedByTeam = new Map<string, number>();
  let seedNo = 0;
  for (const id of fullOrder) {
    if (bracketTeams.has(id)) seedByTeam.set(id, ++seedNo);
  }

  // Set wins per match.
  const tallies = new Map<string, { home: number; away: number }>();
  for (const s of sets ?? []) {
    const t = tallies.get(s.match_id) ?? { home: 0, away: 0 };
    if (s.home_score > s.away_score) t.home += 1;
    else if (s.away_score > s.home_score) t.away += 1;
    tallies.set(s.match_id, t);
  }
  const setsByMatch = new Map<string, { home: number; away: number }[]>();
  for (const s of sets ?? []) {
    const list = setsByMatch.get(s.match_id) ?? [];
    list.push({ home: s.home_score, away: s.away_score });
    setsByMatch.set(s.match_id, list);
  }

  const entry = (id: string | null): BracketEntryView | null =>
    id
      ? {
          teamId: id,
          name: teamName.get(id) ?? "—",
          seed: seedByTeam.get(id) ?? null,
        }
      : null;

  const views: BracketMatchView[] = matches.map((m) => {
    const tally = tallies.get(m.id);
    const winner =
      m.home_team_id && m.away_team_id
        ? matchWinner({
            homeTeamId: m.home_team_id,
            awayTeamId: m.away_team_id,
            sets: setsByMatch.get(m.id) ?? [],
          })
        : null;
    return {
      id: m.id,
      round: m.round as number,
      position: m.bracket_position as number,
      home: entry(m.home_team_id),
      away: entry(m.away_team_id),
      homeScore: tally ? tally.home : null,
      awayScore: tally ? tally.away : null,
      winnerTeamId: m.status === "completed" ? winner : null,
      status: m.status,
    };
  });

  const maxRound = Math.max(...views.map((v) => v.round));
  const rounds: BracketMatchView[][] = [];
  for (let r = 1; r <= maxRound; r++) {
    rounds.push(views.filter((v) => v.round === r));
  }

  const finalMatch = views.find((v) => v.round === maxRound);
  const championTeamId =
    finalMatch && finalMatch.status === "completed"
      ? finalMatch.winnerTeamId
      : null;

  return {
    rounds,
    championTeamId,
    championName: championTeamId
      ? (teamName.get(championTeamId) ?? null)
      : null,
  };
}
