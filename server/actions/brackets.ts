"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { seededBracketMatches } from "@/lib/scheduler/bracket";

type ActionError = { error: string };

/**
 * Generate (or regenerate) the single-elimination bracket from an explicit
 * seed order. The organizer's panel computes the default seeding via
 * selectAdvancers and may reorder it (coin-flip ties), so the final order is
 * passed in verbatim. Byes are resolved into round 2 by seededBracketMatches;
 * bracket matches carry no pool_id, so they use the competition's standard
 * format. Regenerating discards the existing bracket.
 */
export async function generateBracketAction(
  competitionId: string,
  seededTeamIds: string[],
): Promise<ActionError | { matchCount: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can generate the bracket." };
  }

  if (!Array.isArray(seededTeamIds) || seededTeamIds.length < 2) {
    return { error: "At least 2 teams must advance to make a bracket." };
  }
  if (new Set(seededTeamIds).size !== seededTeamIds.length) {
    return { error: "A team can't advance more than once." };
  }
  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("competition_id", competitionId)
    .in("id", seededTeamIds);
  const valid = new Set((teams ?? []).map((t) => t.id));
  if (seededTeamIds.some((id) => !valid.has(id))) {
    return { error: "Some advancing teams aren't in this competition." };
  }

  const matches = seededBracketMatches(seededTeamIds);
  if (matches.length === 0) return { error: "Not enough teams for a bracket." };

  const { error: del } = await supabase
    .from("matches")
    .delete()
    .eq("competition_id", competitionId)
    .not("bracket_position", "is", null);
  if (del) return { error: del.message };

  const rows = matches.map((m) => ({
    competition_id: competitionId,
    round: m.round,
    bracket_position: m.position,
    home_team_id: m.homeTeamId,
    away_team_id: m.awayTeamId,
    status: "scheduled" as const,
  }));
  const { error: ins } = await supabase.from("matches").insert(rows);
  if (ins) return { error: ins.message };

  revalidatePath("/orgs");
  return { matchCount: rows.length };
}
