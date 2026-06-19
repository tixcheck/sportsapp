"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

type ActionError = { error: string };

/**
 * Set the one game a team drops from its own standings (v1 drop-a-game).
 * Organizer-only; the match must be one of the team's own pool games.
 */
export async function setTeamDropAction(
  teamId: string,
  matchId: string,
): Promise<ActionError | { ok: true }> {
  const supabase = await createClient();

  const { data: team } = await supabase
    .from("teams")
    .select("competition_id, pool_id")
    .eq("id", teamId)
    .single();
  if (!team) return { error: "Team not found." };

  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: team.competition_id,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can set drops." };
  }

  const { data: match } = await supabase
    .from("matches")
    .select("pool_id, home_team_id, away_team_id")
    .eq("id", matchId)
    .single();
  if (!match) return { error: "Match not found." };
  if (
    match.pool_id !== team.pool_id ||
    (match.home_team_id !== teamId && match.away_team_id !== teamId)
  ) {
    return { error: "A team can only drop one of its own pool games." };
  }

  const { error } = await supabase
    .from("teams")
    .update({ dropped_match_id: matchId })
    .eq("id", teamId);
  if (error) return { error: error.message };

  revalidatePath("/orgs");
  return { ok: true };
}
