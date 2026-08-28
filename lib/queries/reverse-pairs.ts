/**
 * Reading a Reverse Pairs competition.
 *
 * RLS does the access control (migration 0096): anyone who can view the
 * competition can read its games and lineups; only a competition admin writes.
 */

import { createClient } from "@/lib/supabase/server";
import {
  partnerMatrix,
  reversePairsStandings,
  type PartnerMatrix,
  type ReversePairsStanding,
} from "@/lib/stats/reverse-pairs";
import { suggestRounds } from "@/lib/scheduler/reverse-pairs";

export interface ReversePairsPair {
  id: string;
  name: string;
}

export interface ReversePairsGameRow {
  id: string;
  game: number;
  court: number;
  scheduledAt: string | null;
  scoreA: number | null;
  scoreB: number | null;
  sideA: ReversePairsPair[];
  sideB: ReversePairsPair[];
}

export interface ReversePairsDetail {
  competitionId: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  orgId: string;
  settings: {
    courts: number;
    rounds: number;
    seed: number;
    minutesPerGame: number;
  };
  pairs: ReversePairsPair[];
  games: ReversePairsGameRow[];
  /** Who sat out each round, in round order. */
  byes: ReversePairsPair[][];
  standings: ReversePairsStanding[];
  matrix: PartnerMatrix;
  /** Round counts where every pair plays the same number of games. */
  suggestions: { rounds: number; gamesPerPair: number }[];
  /** Games each pair actually has in the current draw. */
  gamesPerPair: Map<string, number>;
}

export interface ReversePairsSummary {
  id: string;
  name: string;
  slug: string;
  sport: string;
  status: string;
}

/** Every Reverse Pairs event this org runs, newest first. */
export async function getOrgReversePairs(
  orgId: string,
): Promise<ReversePairsSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("competitions")
    .select("id, name, slug, sport, status")
    .eq("org_id", orgId)
    .eq("type", "reverse_pairs")
    .order("created_at", { ascending: false });
  return (data as ReversePairsSummary[] | null) ?? [];
}

export async function getReversePairs(
  competitionId: string,
): Promise<ReversePairsDetail | null> {
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from("competitions")
    .select("id, name, slug, status, timezone, org_id")
    .eq("id", competitionId)
    .maybeSingle();
  if (!comp) return null;

  const [{ data: settings }, { data: teams }, { data: games }] =
    await Promise.all([
      supabase
        .from("reverse_pairs_settings")
        .select("courts, rounds, seed, minutes_per_game")
        .eq("competition_id", competitionId)
        .maybeSingle(),
      supabase
        .from("teams")
        .select("id, name")
        .eq("competition_id", competitionId)
        // Unpaid teams are not entrants — they must never reach a schedule or
        // the standings (migration 0066).
        .neq("status", "pending_payment")
        .order("name"),
      supabase
        .from("reverse_pairs_games")
        .select("id, game, court, scheduled_at, score_a, score_b")
        .eq("competition_id", competitionId)
        .order("game")
        .order("court"),
    ]);

  const pairs: ReversePairsPair[] = (teams ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
  }));
  const byId = new Map(pairs.map((p) => [p.id, p]));

  const gameIds = (games ?? []).map((g) => g.id as string);
  const { data: lineups } = gameIds.length
    ? await supabase
        .from("reverse_pairs_lineups")
        .select("game_id, team_id, side")
        .in("game_id", gameIds)
    : { data: [] as { game_id: string; team_id: string; side: string }[] };

  const sides = new Map<
    string,
    { a: ReversePairsPair[]; b: ReversePairsPair[] }
  >();
  for (const l of lineups ?? []) {
    const entry = sides.get(l.game_id as string) ?? { a: [], b: [] };
    const pair = byId.get(l.team_id as string);
    if (pair) entry[l.side === "b" ? "b" : "a"].push(pair);
    sides.set(l.game_id as string, entry);
  }

  const rows: ReversePairsGameRow[] = (games ?? []).map((g) => {
    const s = sides.get(g.id as string) ?? { a: [], b: [] };
    return {
      id: g.id as string,
      game: g.game as number,
      court: g.court as number,
      scheduledAt: (g.scheduled_at as string | null) ?? null,
      scoreA: (g.score_a as number | null) ?? null,
      scoreB: (g.score_b as number | null) ?? null,
      sideA: s.a,
      sideB: s.b,
    };
  });

  const results = rows.map((r) => ({
    sideA: r.sideA.map((p) => p.id),
    sideB: r.sideB.map((p) => p.id),
    scoreA: r.scoreA,
    scoreB: r.scoreB,
  }));

  // Who sat out each round: everyone not on a court that round. Derived rather
  // than stored — the lineups already say it, and a stored copy could disagree.
  const roundNumbers = [...new Set(rows.map((r) => r.game))].sort(
    (a, b) => a - b,
  );
  const byes: ReversePairsPair[][] = roundNumbers.map((n) => {
    const playing = new Set(
      rows
        .filter((r) => r.game === n)
        .flatMap((r) => [...r.sideA, ...r.sideB].map((p) => p.id)),
    );
    return pairs.filter((p) => !playing.has(p.id));
  });

  const gamesPerPair = new Map<string, number>(pairs.map((p) => [p.id, 0]));
  for (const r of rows) {
    for (const p of [...r.sideA, ...r.sideB]) {
      gamesPerPair.set(p.id, (gamesPerPair.get(p.id) ?? 0) + 1);
    }
  }

  const courts = (settings?.courts as number | undefined) ?? 2;

  return {
    competitionId: comp.id as string,
    name: comp.name as string,
    slug: comp.slug as string,
    status: comp.status as string,
    timezone: (comp.timezone as string | null) ?? "America/Toronto",
    orgId: comp.org_id as string,
    settings: {
      courts,
      rounds: (settings?.rounds as number | undefined) ?? 8,
      seed: (settings?.seed as number | undefined) ?? 1,
      minutesPerGame: (settings?.minutes_per_game as number | undefined) ?? 15,
    },
    pairs,
    games: rows,
    byes,
    standings: reversePairsStandings(
      pairs.map((p) => p.id),
      results,
    ),
    matrix: partnerMatrix(
      pairs.map((p) => p.id),
      results,
    ),
    suggestions: suggestRounds(pairs.length, courts, { min: 1, max: 20 }),
    gamesPerPair,
  };
}
