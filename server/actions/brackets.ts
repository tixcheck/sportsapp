"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { dualBracketMatches } from "@/lib/scheduler/bracket";

type ActionError = { error: string };

/** Seed lists per track. Omitting `consolation` ⇒ a single (untagged) bracket. */
export interface BracketSeeds {
  championship: string[];
  consolation?: string[];
}

/**
 * Generate (or regenerate) the bracket(s) from explicit seed orders. The
 * organizer's panel computes the default seeding via selectAdvancers and may
 * reorder it (coin-flip ties), so each track's order is passed in verbatim.
 * One list ⇒ a single-elim bracket (track null, unchanged behaviour); two lists
 * ⇒ independent Championship + Consolation trees. Byes are resolved into round 2
 * by seededBracketMatches; bracket matches carry no pool_id, so they use the
 * competition's standard format. Regenerating discards every existing bracket.
 */
export async function generateBracketAction(
  competitionId: string,
  seeds: BracketSeeds,
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

  const championship = seeds.championship ?? [];
  const consolation = seeds.consolation ?? [];
  if (championship.length < 2) {
    return { error: "At least 2 teams must advance to make a bracket." };
  }
  if (consolation.length === 1) {
    return { error: "A consolation bracket needs at least 2 teams." };
  }
  const all = [...championship, ...consolation];
  if (new Set(all).size !== all.length) {
    return { error: "A team can't appear in more than one bracket slot." };
  }
  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("competition_id", competitionId)
    .in("id", all);
  const valid = new Set((teams ?? []).map((t) => t.id));
  if (all.some((id) => !valid.has(id))) {
    return { error: "Some advancing teams aren't in this competition." };
  }

  const matches = dualBracketMatches({
    championship,
    consolation: consolation.length ? consolation : undefined,
  });
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
    bracket_track: m.track,
    home_team_id: m.homeTeamId,
    away_team_id: m.awayTeamId,
    status: "scheduled" as const,
  }));
  const { error: ins } = await supabase.from("matches").insert(rows);
  if (ins) return { error: ins.message };

  revalidatePath("/orgs");
  return { matchCount: rows.length };
}
