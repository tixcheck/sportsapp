"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  ladderNightResultsSchema,
  type LadderNightResultsInput,
} from "@/lib/validations/ladder";

type ActionError = { error: string };

/**
 * Save one tier's final standings for a week (`result_rank`, `result_points`).
 *
 * The standings belong to the week they were played, so they can be entered
 * or corrected any time until that week is locked. After the lock they are
 * what moved the teams; changing them then would leave the ladder describing
 * a night that no longer matches its own record, so it's refused — undo the
 * lock first.
 */
export async function saveLadderNightResultsAction(
  values: LadderNightResultsInput,
): Promise<ActionError | { saved: number }> {
  const parsed = ladderNightResultsSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the standings." };
  }
  const { competitionId, divisionId, week, results } = parsed.data;

  const supabase = await createClient();

  const [{ data: placements }, { data: locked }] = await Promise.all([
    supabase
      .from("ladder_placements")
      .select("id, team_id")
      .eq("competition_id", competitionId)
      .eq("division_id", divisionId)
      .eq("week", week),
    supabase
      .from("ladder_placements")
      .select("id")
      .eq("competition_id", competitionId)
      .eq("week", week + 1)
      .limit(1),
  ]);

  if (!placements || placements.length === 0) {
    return { error: `This tier has no teams in week ${week}.` };
  }
  if ((locked ?? []).length > 0) {
    return {
      error: `Week ${week} is locked. Undo the lock to change its standings.`,
    };
  }

  const inTier = new Set(placements.map((p) => p.team_id as string));
  if (results.length > 0) {
    const given = new Set(results.map((r) => r.teamId));
    const exact =
      given.size === results.length &&
      given.size === inTier.size &&
      [...given].every((id) => inTier.has(id));
    // The page and the draw disagree about who played — most likely a stale
    // tab after a redraw. Saving would rank somebody who wasn't there.
    if (!exact) {
      return {
        error: "The teams in this tier have changed. Reload and enter again.",
      };
    }
  }

  // Clear first: ranks are unique per tier and week, so re-ordering in place
  // would collide mid-way (swap 1 and 2 and the first update finds 1 taken).
  const { error: clearErr } = await supabase
    .from("ladder_placements")
    .update({ result_rank: null, result_points: null })
    .eq("competition_id", competitionId)
    .eq("division_id", divisionId)
    .eq("week", week);
  if (clearErr) return { error: clearErr.message };

  const idOf = new Map(
    placements.map((p) => [p.team_id as string, p.id as string]),
  );
  for (const [i, r] of results.entries()) {
    const { error } = await supabase
      .from("ladder_placements")
      .update({ result_rank: i + 1, result_points: r.points })
      .eq("id", idOf.get(r.teamId)!);
    // A half-written tier is refused by the lock, so a failure here can't move
    // anyone on a partial entry; saving again finishes it.
    if (error) return { error: error.message };
  }

  revalidatePath("/orgs");
  return { saved: results.length };
}
