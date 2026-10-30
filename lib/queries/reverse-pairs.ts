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
  type ReversePairsRanking,
  type ReversePairsStanding,
} from "@/lib/stats/reverse-pairs";
import { parseBonusItems, type BonusItem } from "@/lib/reverse-pairs/bonus";
import { suggestRounds } from "@/lib/scheduler/reverse-pairs";
import { displayPairName } from "@/lib/reverse-pairs/draw-number";

export interface ReversePairsPair {
  id: string;
  /** What the schedule and standings show: "Pair 7" until a drawn number is entered. */
  name: string;
  /** The pair's own name, as entered. */
  entryName: string;
  /** Drawn-at-the-door events only (0187): the pair's place in the schedule. */
  drawNumber: number | null;
  drawNumberSet: boolean;
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
  visibility: string;
  timezone: string;
  venue: string | null;
  /** "YYYY-MM-DD" — the day it's played. */
  startDate: string | null;
  /** "HH:mm" at the venue, when game 1 starts. */
  startTime: string;
  orgId: string;
  settings: {
    courts: number;
    rounds: number;
    seed: number;
    minutesPerGame: number;
    registrationOpen: boolean;
    /** ISO instant, or null for no deadline. */
    registrationDeadline: string | null;
    maxPairs: number | null;
    /** Most one game may swing the standings. Null = uncapped (0133). */
    pointCap: number | null;
    /** What orders the standings (0192). */
    ranking: ReversePairsRanking;
    /** What the organizer can award, e.g. costume bonuses. Empty = none. */
    bonusItems: BonusItem[];
  };
  /** Items awarded to each pair, by pair id (0192). */
  bonusAwards: Map<string, Set<string>>;
  /** Points a game is played to — the target, not a best-of. */
  pointsPerGame: number;
  /** Whether a pair may sign up right now: open, in time, and not full. */
  registrationLive: boolean;
  pairs: ReversePairsPair[];
  /** Pairs pick a number at the door, and the organizer enters it (0187). */
  drawNumbers: boolean;
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
    .select(
      "id, name, slug, status, visibility, timezone, venue, start_date, start_time, org_id, match_format",
    )
    .eq("id", competitionId)
    .maybeSingle();
  if (!comp) return null;

  const [
    { data: settings },
    { data: teams },
    { data: games },
    { data: bonusRows },
  ] = await Promise.all([
    supabase
      .from("reverse_pairs_settings")
      .select(
        "courts, rounds, seed, minutes_per_game, registration_open, registration_deadline, max_pairs, point_cap, ranking, bonus_items",
      )
      .eq("competition_id", competitionId)
      .maybeSingle(),
    supabase
      .from("teams")
      .select("id, name, draw_number, draw_number_set")
      .eq("competition_id", competitionId)
      // Unpaid teams are not entrants — they must never reach a schedule or
      // the standings (migration 0066).
      .eq("status", "active")
      .order("name"),
    supabase
      .from("reverse_pairs_games")
      .select("id, game, court, scheduled_at, score_a, score_b")
      .eq("competition_id", competitionId)
      .order("game")
      .order("court"),
    supabase
      .from("reverse_pairs_bonuses")
      .select("team_id, item, points")
      .eq("competition_id", competitionId),
  ]);

  const pairs: ReversePairsPair[] = (teams ?? []).map((t) => {
    const p = {
      name: t.name as string,
      drawNumber: (t.draw_number as number | null) ?? null,
      drawNumberSet: (t.draw_number_set as boolean | null) ?? false,
    };
    return {
      ...p,
      id: t.id as string,
      entryName: p.name,
      name: displayPairName(p),
    };
  });
  const drawNumbers = pairs.some((p) => p.drawNumber !== null);
  // By number, so "Pair 1 … Pair 21" reads in order rather than as text.
  if (drawNumbers) {
    pairs.sort((a, b) => (a.drawNumber ?? 999) - (b.drawNumber ?? 999));
  }
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
  const ranking: ReversePairsRanking =
    settings?.ranking === "wins_pct" ? "wins_pct" : "differential";

  const bonus: Record<string, number> = {};
  const bonusAwards = new Map<string, Set<string>>();
  for (const b of bonusRows ?? []) {
    const id = b.team_id as string;
    bonus[id] = (bonus[id] ?? 0) + (b.points as number);
    bonusAwards.set(
      id,
      (bonusAwards.get(id) ?? new Set()).add(b.item as string),
    );
  }

  // Whether a pair could actually sign up this second. The same three rules the
  // register function enforces, so the form matches what pressing it would do.
  const deadline = (settings?.registration_deadline as string | null) ?? null;
  const maxPairs = (settings?.max_pairs as number | null) ?? null;
  const registrationLive =
    comp.visibility === "public" &&
    ((settings?.registration_open as boolean | undefined) ?? false) &&
    (!deadline || new Date(deadline).getTime() > Date.now()) &&
    (maxPairs === null || pairs.length < maxPairs);

  return {
    competitionId: comp.id as string,
    name: comp.name as string,
    slug: comp.slug as string,
    status: comp.status as string,
    visibility: comp.visibility as string,
    timezone: (comp.timezone as string | null) ?? "America/Toronto",
    venue: (comp.venue as string | null) ?? null,
    startDate: comp.start_date ? String(comp.start_date).slice(0, 10) : null,
    // The draw's own fallback, so the form shows the time games would get.
    startTime: String(comp.start_time ?? "19:00").slice(0, 5),
    orgId: comp.org_id as string,
    settings: {
      courts,
      rounds: (settings?.rounds as number | undefined) ?? 8,
      seed: (settings?.seed as number | undefined) ?? 1,
      minutesPerGame: (settings?.minutes_per_game as number | undefined) ?? 15,
      registrationOpen:
        (settings?.registration_open as boolean | undefined) ?? false,
      registrationDeadline:
        (settings?.registration_deadline as string | null) ?? null,
      maxPairs: (settings?.max_pairs as number | null) ?? null,
      pointCap: (settings?.point_cap as number | null) ?? null,
      ranking,
      bonusItems: parseBonusItems(settings?.bonus_items),
    },
    bonusAwards,
    pointsPerGame:
      (comp.match_format as { setsToPoints?: number[] } | null)
        ?.setsToPoints?.[0] ?? 25,
    registrationLive,
    pairs,
    drawNumbers,
    games: rows,
    byes,
    standings: reversePairsStandings(
      pairs.map((p) => p.id),
      results,
      {
        pointCap: (settings?.point_cap as number | null) ?? null,
        ranking,
        bonus,
      },
    ),
    matrix: partnerMatrix(
      pairs.map((p) => p.id),
      results,
    ),
    suggestions: suggestRounds(pairs.length, courts, { min: 1, max: 20 }),
    gamesPerPair,
  };
}

/**
 * The same detail, found by its public slug.
 *
 * RLS decides whether it comes back: a signed-out visitor sees only a
 * competition marked public, so an unpublished event 404s rather than leaking.
 */
export async function getReversePairsBySlug(
  slug: string,
): Promise<ReversePairsDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("competitions")
    .select("id")
    .eq("slug", slug)
    .eq("type", "reverse_pairs")
    .maybeSingle();
  if (!data) return null;
  return getReversePairs(data.id as string);
}
