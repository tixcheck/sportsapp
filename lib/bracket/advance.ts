/**
 * Bracket auto-advance (Phase 8). After a bracket match completes, the winner
 * fills the next round's open slot. The winner is computed in TS (matchWinner —
 * the single source of truth) and placed by the place_bracket_winner SECURITY
 * DEFINER rpc, which is allowed to write the parent match the caller doesn't own.
 */
import type { createClient } from "@/lib/supabase/server";
import { matchWinner } from "@/lib/scheduler/tiebreakers";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

export async function advanceBracketWinner(
  supabase: SupabaseServer,
  matchId: string,
): Promise<void> {
  const { data: m } = await supabase
    .from("matches")
    .select("home_team_id, away_team_id, bracket_position")
    .eq("id", matchId)
    .single();
  if (!m || m.bracket_position === null || !m.home_team_id || !m.away_team_id) {
    return;
  }

  const { data: sets } = await supabase
    .from("sets")
    .select("home_score, away_score, set_number")
    .eq("match_id", matchId)
    .order("set_number", { ascending: true });

  const winner = matchWinner({
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
    sets: (sets ?? []).map((s) => ({ home: s.home_score, away: s.away_score })),
  });
  if (!winner) return;

  await supabase.rpc("place_bracket_winner", {
    _match_id: matchId,
    _winner_team_id: winner,
  });
}
