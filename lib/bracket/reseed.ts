/**
 * Re-seeding bracket persistence + advancement (server side; pure pairing logic
 * lives in lib/scheduler/reseed). The competition stores the entrant seed order
 * in competitions.bracket_reseed_seeds; its presence marks a re-seed bracket.
 * Round 1 is created at generation; each later round is created here once the
 * current round finishes, re-seeding the survivors (highest seed vs lowest).
 */
import type { createClient } from "@/lib/supabase/server";
import { matchWinner } from "@/lib/scheduler/tiebreakers";
import {
  reseedFirstRound,
  reseedNextRound,
  type ReseedPair,
} from "@/lib/scheduler/reseed";
import type { MatchFormat } from "@/lib/db/schema";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

export interface ReseedRoundContext {
  competitionId: string;
  /** Courts the bracket spreads across (round-robin per round). */
  courts: number[];
  /** Per-match format stamped on each bracket match (e.g. best-of-3). */
  bracketFormat: MatchFormat | null;
  /** Bracket start (ms) for a rough scheduled time; null = leave times unset. */
  startMs: number | null;
  /** Minutes per bracket game (for the rough time stagger). */
  slotMinutes: number;
}

/** Insert one re-seed round's matches (spread across courts, staggered by round). */
async function insertReseedRound(
  supabase: SupabaseServer,
  ctx: ReseedRoundContext,
  round: number,
  pairs: ReseedPair[],
): Promise<{ error: string } | null> {
  if (pairs.length === 0) return null;
  const courts = ctx.courts.length ? ctx.courts : [1];
  const slotMs = ctx.slotMinutes * 60_000;
  const rows = pairs.map((p, i) => {
    const wave = Math.floor(i / courts.length);
    const ms =
      ctx.startMs != null
        ? ctx.startMs + (round - 1) * slotMs + wave * slotMs
        : null;
    return {
      competition_id: ctx.competitionId,
      round,
      bracket_position: i + 1,
      home_team_id: p.homeTeamId,
      away_team_id: p.awayTeamId,
      status: "scheduled" as const,
      court: `Court ${courts[i % courts.length]}`,
      match_format: ctx.bracketFormat ?? null,
      scheduled_at: ms != null ? new Date(ms).toISOString() : null,
    };
  });
  const { error } = await supabase.from("matches").insert(rows);
  return error ? { error: error.message } : null;
}

/**
 * Generate a fresh re-seed bracket: persist the entrant seed order and create
 * round 1 (top seeds bye, the rest paired high-vs-low). Assumes existing bracket
 * matches were already cleared by the caller.
 */
export async function generateReseedBracket(
  supabase: SupabaseServer,
  ctx: ReseedRoundContext,
  seededTeamIds: string[],
): Promise<{ error: string } | { matchCount: number }> {
  const { error: setErr } = await supabase
    .from("competitions")
    .update({ bracket_reseed_seeds: seededTeamIds })
    .eq("id", ctx.competitionId);
  if (setErr) return { error: setErr.message };

  const { matches } = reseedFirstRound(seededTeamIds);
  const err = await insertReseedRound(supabase, ctx, 1, matches);
  if (err) return err;
  return { matchCount: matches.length };
}

/**
 * After a re-seed bracket match completes, create the next round IF the current
 * round is fully done: survivors = entrants minus losers, re-seeded high-vs-low.
 * No-op if it isn't a re-seed bracket, the round isn't finished, the next round
 * already exists, or the champion is decided. Idempotent.
 */
export async function advanceReseedBracket(
  supabase: SupabaseServer,
  competitionId: string,
): Promise<void> {
  const { data: comp } = await supabase
    .from("competitions")
    .select("bracket_reseed_seeds, timezone, start_date, start_time")
    .eq("id", competitionId)
    .single();
  const entrants = (comp?.bracket_reseed_seeds as string[] | null) ?? null;
  if (!entrants || entrants.length === 0) return;

  const { data: bracketMatches } = await supabase
    .from("matches")
    .select(
      "id, round, home_team_id, away_team_id, status, court, match_format",
    )
    .eq("competition_id", competitionId)
    .not("bracket_position", "is", null);
  const rows = bracketMatches ?? [];
  if (rows.length === 0) return;

  const maxRound = Math.max(...rows.map((m) => (m.round as number) ?? 1));
  const thisRound = rows.filter((m) => (m.round as number) === maxRound);
  if (!thisRound.every((m) => m.status === "completed")) return; // round unfinished
  if (rows.some((m) => (m.round as number) === maxRound + 1)) return; // already made

  // Losers across every completed bracket match → survivors are the rest.
  const { data: sets } = await supabase
    .from("sets")
    .select("match_id, set_number, home_score, away_score")
    .in(
      "match_id",
      rows.map((m) => m.id as string),
    )
    .order("set_number", { ascending: true });
  const setsByMatch = new Map<string, { home: number; away: number }[]>();
  for (const s of sets ?? []) {
    const list = setsByMatch.get(s.match_id as string) ?? [];
    list.push({ home: s.home_score as number, away: s.away_score as number });
    setsByMatch.set(s.match_id as string, list);
  }
  const losers = new Set<string>();
  for (const m of rows) {
    if (m.status !== "completed") continue;
    const home = m.home_team_id as string | null;
    const away = m.away_team_id as string | null;
    if (!home || !away) continue;
    const winner = matchWinner({
      homeTeamId: home,
      awayTeamId: away,
      sets: setsByMatch.get(m.id as string) ?? [],
    });
    if (winner) losers.add(winner === home ? away : home);
  }

  const survivors = entrants.filter((id) => !losers.has(id));
  if (survivors.length <= 1) return; // champion decided — nothing more to schedule

  const seedIndex = new Map(entrants.map((id, i) => [id, i]));
  const pairs = reseedNextRound(survivors, seedIndex);

  // Reuse the bracket's own courts/format/timezone for the new round.
  const courts = [
    ...new Set(
      rows
        .map((m) => {
          const n = String(m.court ?? "").match(/\d+/);
          return n ? parseInt(n[0], 10) : null;
        })
        .filter((n): n is number => n != null),
    ),
  ].sort((a, b) => a - b);
  const bracketFormat =
    (thisRound[0]?.match_format as MatchFormat | null) ?? null;

  await insertReseedRound(
    supabase,
    {
      competitionId,
      courts: courts.length ? courts : [1],
      bracketFormat,
      startMs: null, // later rounds run live; the organizer sets/retimes if needed
      slotMinutes: 0,
    },
    maxRound + 1,
    pairs,
  );
}
