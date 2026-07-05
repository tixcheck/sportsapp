import { createClient } from "@/lib/supabase/server";
import { loadStandings } from "@/lib/standings/compute";
import {
  advancementCutoffTies,
  crossPoolSeedOrder,
  matchWinner,
} from "@/lib/scheduler/tiebreakers";
import {
  bracketSeedTracks,
  projectBracket,
} from "@/lib/scheduler/bracket-project";
import {
  assignBracketTimes,
  bracketMatchCourt,
  bracketSlotKey,
  nextPowerOfTwo,
} from "@/lib/scheduler/bracket";
import { DEFAULT_SLOT_MINUTES } from "@/lib/scheduler/pools";
import { estimateMatchMinutes } from "@/lib/formats";
import {
  tournamentFormat,
  type FormatTemplate,
} from "@/lib/tournament-formats";
import type { MatchFormat } from "@/lib/db/schema";

export interface BracketEntryView {
  teamId: string;
  name: string;
  seed: number | null;
  /** Pool record ("W-L" or "W-L-T") that earned the seed. Null if unknown. */
  record: string | null;
  /** Point ratio (PF/PA) at seeding time — justifies the order. */
  ratio: number | null;
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
  /** Auto-assigned at generation ("Court N"); null on the final until set. */
  court: string | null;
  scheduledAt: string | null;
}

export interface BracketView {
  /** rounds[0] = first round; last = final. */
  rounds: BracketMatchView[][];
  championTeamId: string | null;
  championName: string | null;
}

export type BracketTrackKey = "championship" | "consolation" | null;

export interface BracketTrackView {
  /** Null = a single-elim bracket; otherwise the dual-format track. */
  track: BracketTrackKey;
  /** Heading to show ("Championship"/"Consolation"); null for single-elim. */
  label: string | null;
  view: BracketView;
}

type BracketMatchRow = {
  id: string;
  round: number | null;
  bracket_position: number | null;
  bracket_track: BracketTrackKey;
  home_team_id: string | null;
  away_team_id: string | null;
  status: string;
  court: string | null;
  scheduled_at: string | null;
};

const TRACK_ORDER: BracketTrackKey[] = ["championship", "consolation", null];
const TRACK_LABEL: Record<string, string> = {
  championship: "Championship",
  consolation: "Consolation",
};

/**
 * The bracket(s) for a tournament, shaped for the visual tree — one entry for a
 * single-elim bracket, two for the Championship + Consolation format. Empty when
 * none exists. Each track is seeded and crowned independently.
 */
export async function getBrackets(
  competitionId: string,
): Promise<BracketTrackView[]> {
  const supabase = await createClient();

  const { data: matchData } = await supabase
    .from("matches")
    .select(
      "id, round, bracket_position, bracket_track, home_team_id, away_team_id, status, court, scheduled_at",
    )
    .eq("competition_id", competitionId)
    .not("bracket_position", "is", null)
    .order("round", { ascending: true })
    .order("bracket_position", { ascending: true });
  const matches = (matchData ?? []) as BracketMatchRow[];
  if (matches.length === 0) return [];

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

  // Cross-pool seed order over the whole field; each track numbers its own teams
  // 1..N along this order (so seeds reflect where teams ranked out of pools).
  const groups = await loadStandings(supabase, competitionId);
  const fullOrder = crossPoolSeedOrder(groups.map((g) => g.rows));
  // Pool record + ratio per team, to justify each seed on the bracket.
  const statsByTeam = new Map(
    groups.flatMap((g) =>
      g.rows.map((r) => [
        r.teamId,
        {
          record: r.mt > 0 ? `${r.mw}-${r.ml}-${r.mt}` : `${r.mw}-${r.ml}`,
          ratio: r.pointRatio,
        },
      ]),
    ),
  );

  const tallies = new Map<string, { home: number; away: number }>();
  const setsByMatch = new Map<string, { home: number; away: number }[]>();
  for (const s of sets ?? []) {
    const t = tallies.get(s.match_id) ?? { home: 0, away: 0 };
    if (s.home_score > s.away_score) t.home += 1;
    else if (s.away_score > s.home_score) t.away += 1;
    tallies.set(s.match_id, t);
    const list = setsByMatch.get(s.match_id) ?? [];
    list.push({ home: s.home_score, away: s.away_score });
    setsByMatch.set(s.match_id, list);
  }

  const buildView = (trackMatches: BracketMatchRow[]): BracketView => {
    const trackTeams = new Set(
      trackMatches
        .flatMap((m) => [m.home_team_id, m.away_team_id])
        .filter(Boolean) as string[],
    );
    const seedByTeam = new Map<string, number>();
    let seedNo = 0;
    for (const id of fullOrder) {
      if (trackTeams.has(id)) seedByTeam.set(id, ++seedNo);
    }

    const entry = (id: string | null): BracketEntryView | null =>
      id
        ? {
            teamId: id,
            name: teamName.get(id) ?? "—",
            seed: seedByTeam.get(id) ?? null,
            record: statsByTeam.get(id)?.record ?? null,
            ratio: statsByTeam.get(id)?.ratio ?? null,
          }
        : null;

    const views: BracketMatchView[] = trackMatches.map((m) => {
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
        court: m.court,
        scheduledAt: m.scheduled_at,
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
  };

  const out: BracketTrackView[] = [];
  for (const track of TRACK_ORDER) {
    const trackMatches = matches.filter((m) => m.bracket_track === track);
    if (trackMatches.length === 0) continue;
    out.push({
      track,
      label: track ? TRACK_LABEL[track] : null,
      view: buildView(trackMatches),
    });
  }
  return out;
}

// --- live preview (before the bracket is generated) ------------------------

export interface BracketPreviewTeam {
  teamId: string;
  teamName: string;
  track: BracketTrackKey;
  seed: number;
  /** Round-1 opponent name; null = a bye into round 2. */
  opponentName: string | null;
  /** A rough estimate (ISO) of the team's first playoff game; null = no basis. */
  firstGameAt: string | null;
}

export interface BracketPreview {
  template: FormatTemplate;
  /** Always true — it's a projection from current standings, not the real draw. */
  provisional: true;
  /** Every pool match is finished (the projection is then near-final). */
  poolsComplete: boolean;
  /** Teams are tied across the advancement cutoff (seeding is ambiguous). */
  tiedAtCutoff: boolean;
  teams: BracketPreviewTeam[];
}

/**
 * Projected bracket from the live standings — "if pools ended now". Uses the
 * shared bracketSeedTracks + projectBracket (the same seeding/pairing the real
 * generation uses), with the format's default advancement. Null when there are
 * no standings yet. Does not read or write any bracket rows.
 */
export async function getBracketPreview(
  competitionId: string,
): Promise<BracketPreview | null> {
  const supabase = await createClient();

  const groups = await loadStandings(supabase, competitionId);
  if (groups.length === 0) return null;

  const [{ data: settings }, { data: comp }] = await Promise.all([
    supabase
      .from("tournament_settings")
      .select("format_template, pool_format")
      .eq("competition_id", competitionId)
      .maybeSingle(),
    supabase
      .from("competitions")
      .select("match_format")
      .eq("id", competitionId)
      .maybeSingle(),
  ]);
  const template = (settings?.format_template ?? "single") as FormatTemplate;
  const bracketFormat = comp?.match_format as MatchFormat | null;

  const pools = groups.map((g) => g.rows);
  const projection = projectBracket(bracketSeedTracks(pools, template));

  const nameById = new Map(
    groups.flatMap((g) => g.rows.map((r) => [r.teamId, r.teamName] as const)),
  );

  const { data: poolMatches } = await supabase
    .from("matches")
    .select("status, scheduled_at")
    .eq("competition_id", competitionId)
    .not("pool_id", "is", null);
  const poolsComplete =
    (poolMatches?.length ?? 0) > 0 &&
    (poolMatches ?? []).every((m) => m.status === "completed");

  // Ambiguous seeding at the advancement boundary (a coin-flip-level tie).
  const tiedAtCutoff =
    template === "champ_consolation"
      ? advancementCutoffTies(
          pools,
          "overall",
          tournamentFormat("champ_consolation").split!.championship,
        ).length > 0
      : advancementCutoffTies(pools, "perPool", 2).length > 0;

  // A rough estimate of each team's first playoff game: chain off the latest
  // pool match's end and run the SAME timing engine generation uses (default
  // court pairs 1&2 / 3&4). Only when pools have times — no basis ⇒ no estimate.
  const poolEndsMs = (poolMatches ?? [])
    .map((m) => (m.scheduled_at ? new Date(m.scheduled_at).getTime() : null))
    .filter((t): t is number => t != null);
  const firstGameByTeam = new Map<string, number>();
  if (poolEndsMs.length > 0) {
    const poolFormat =
      (settings?.pool_format as MatchFormat | null) ?? bracketFormat;
    const poolSlot = poolFormat
      ? estimateMatchMinutes(poolFormat)
      : DEFAULT_SLOT_MINUTES;
    const bracketSlotMin = bracketFormat
      ? estimateMatchMinutes(bracketFormat)
      : DEFAULT_SLOT_MINUTES;
    const QUARTER = 15 * 60_000;
    const startMs =
      Math.ceil((Math.max(...poolEndsMs) + poolSlot * 60_000) / QUARTER) *
      QUARTER;
    const sizeByTrack = new Map<BracketTrackKey, number>(
      projection.tracks.map((t) => [t.track, nextPowerOfTwo(t.seeds.length)]),
    );
    const times = assignBracketTimes(
      projection.matches.map((m) => ({
        round: m.round,
        position: m.position,
        track: m.track,
        court: bracketMatchCourt(
          m.round,
          m.position,
          sizeByTrack.get(m.track) ?? 2,
          [1, 2, 3],
        ),
      })),
      startMs,
      bracketSlotMin * 60_000,
    );
    // The earliest round a team appears in is its first game (round 2 if it byes).
    for (const m of [...projection.matches].sort((a, b) => a.round - b.round)) {
      const t = times.get(bracketSlotKey(m.track, m.round, m.position));
      if (t == null) continue;
      for (const id of [m.homeTeamId, m.awayTeamId]) {
        if (id && !firstGameByTeam.has(id)) firstGameByTeam.set(id, t);
      }
    }
  }

  const teams: BracketPreviewTeam[] = [...projection.byTeam.values()].map(
    (p) => ({
      teamId: p.teamId,
      teamName: nameById.get(p.teamId) ?? "—",
      track: p.track,
      seed: p.seed,
      opponentName: p.opponentTeamId
        ? (nameById.get(p.opponentTeamId) ?? "—")
        : null,
      firstGameAt: firstGameByTeam.has(p.teamId)
        ? new Date(firstGameByTeam.get(p.teamId)!).toISOString()
        : null,
    }),
  );

  return { template, provisional: true, poolsComplete, tiedAtCutoff, teams };
}
