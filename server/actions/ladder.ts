"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { roundWeeksOf } from "@/lib/scheduler/bvl-round";
import {
  drawLadderWeekSchema,
  ladderAutoAdvanceSchema,
  ladderSettingsSchema,
  lockLadderWeekSchema,
  type LadderSettingsInput,
} from "@/lib/validations/ladder";
import { SETTLED, drawLadderWeek, lockLadderWeek } from "@/server/ladder/week";

type ActionError = { error: string };

/**
 * Save the ladder configuration.
 *
 * `swaps` carries one count per boundary, so a league with N tiers needs N-1
 * entries; anything longer is trimmed and anything missing defaults to 0. There
 * is deliberately no separate up/down setting — see lib/scheduler/
 * ladder-movement.ts for why an unbalanced exchange isn't representable.
 */
export async function saveLadderSettingsAction(
  values: LadderSettingsInput,
): Promise<ActionError | { success: true }> {
  const parsed = ladderSettingsSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  }
  const v = parsed.data;

  const supabase = await createClient();

  const { data: divisions } = await supabase
    .from("divisions")
    .select("id")
    .eq("competition_id", v.competitionId);
  const tierCount = (divisions ?? []).length;

  if (v.enabled && tierCount < 2) {
    return {
      error: "A ladder needs at least two tiers. Add tiers first.",
    };
  }

  const boundaries = Math.max(0, tierCount - 1);
  const swaps = Array.from({ length: boundaries }, (_, i) => v.swaps[i] ?? 0);

  const { error } = await supabase
    .from("league_settings")
    .update({
      ladder_enabled: v.enabled,
      ladder_unit: v.unit,
      ladder_target: v.target,
      ladder_swaps: swaps,
    })
    .eq("competition_id", v.competitionId);
  if (error) return { error: error.message };

  revalidatePath("/orgs");
  return { success: true };
}

/**
 * Whether finished weeks lock and the next draws overnight by themselves
 * (0171, app/api/cron/ladder-advance). RLS on league_settings decides who may.
 */
export async function setLadderAutoAdvanceAction(
  competitionId: string,
  on: boolean,
): Promise<ActionError | { success: true }> {
  const parsed = ladderAutoAdvanceSchema.safeParse({ competitionId, on });
  if (!parsed.success) return { error: "Unknown league." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("league_settings")
    .update({ ladder_auto_advance: parsed.data.on })
    .eq("competition_id", parsed.data.competitionId)
    .select("competition_id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "You can't change this league's settings." };
  }
  revalidatePath("/orgs");
  return { success: true };
}

/**
 * Draw the next week's games.
 *
 * Week 1 seeds the ladder from each team's current tier (the one they
 * registered into). Later weeks read the placements the previous lock wrote —
 * which is why a ladder season can't be generated up front.
 */
export async function drawLadderWeekAction(
  competitionId: string,
): Promise<
  ActionError | { week: number; matchCount: number; shorted: number }
> {
  const parsed = drawLadderWeekSchema.safeParse({ competitionId });
  if (!parsed.success) return { error: "Unknown league." };
  return drawLadderWeek(await createClient(), competitionId);
}

/**
 * Lock a week: rank each tier on that night alone, swap teams across the
 * boundaries, and write next week's placements.
 */
export async function lockLadderWeekAction(
  competitionId: string,
  week: number,
): Promise<
  ActionError | { nextWeek: number; moves: number; adjusted: number }
> {
  const parsed = lockLadderWeekSchema.safeParse({ competitionId, week });
  if (!parsed.success) return { error: "Unknown league or week." };
  return lockLadderWeek(await createClient(), competitionId, week);
}

/**
 * Undo the most recent lock: drop the next week's placements AND the fixtures
 * drawn from them, and put teams back in the tier they played in.
 *
 * For the organizer who locked a week before a late score came in.
 *
 * The fixtures go too because they are derived from exactly the placements
 * being removed. Leaving them behind is what bit Mango on 2026-09-23: week 2
 * had already been drawn when week 1 was unlocked and re-locked under a
 * corrected tiebreaker, and the surviving fixtures still paired teams by the
 * old ladder — internally consistent, completely wrong, and with nothing on
 * screen to say so. Redrawing is a click; noticing was four queries.
 */
export async function unlockLadderWeekAction(
  competitionId: string,
  week: number,
): Promise<ActionError | { success: true }> {
  const parsed = lockLadderWeekSchema.safeParse({ competitionId, week });
  if (!parsed.success) return { error: "Unknown league or week." };

  const supabase = await createClient();

  // The next ROUND is what a lock created: one week, or several for BVL.
  const { data: rs } = await supabase
    .from("league_settings")
    .select("ladder_round_weeks")
    .eq("competition_id", competitionId)
    .maybeSingle();
  const roundLength =
    (rs as { ladder_round_weeks: number | null } | null)?.ladder_round_weeks ??
    1;
  const nextRound = roundWeeksOf(week + 1, roundLength);

  // Only the newest week can be undone — unwinding further would need every
  // later week redrawn, and those games may already have been played.
  const { data: later } = await supabase
    .from("ladder_placements")
    .select("week")
    .eq("competition_id", competitionId)
    .gt("week", nextRound[nextRound.length - 1])
    .limit(1);
  if ((later ?? []).length > 0) {
    return { error: "A later week is already locked. Undo that one first." };
  }

  const { data: nextPlacements } = await supabase
    .from("ladder_placements")
    .select("team_id, division_id")
    .eq("competition_id", competitionId)
    .eq("week", week + 1);
  if (!nextPlacements || nextPlacements.length === 0) {
    return { error: "That week isn't locked." };
  }

  const { data: nextMatches } = await supabase
    .from("matches")
    .select("id, status")
    .eq("competition_id", competitionId)
    .in("round", nextRound);

  // Scores are never discarded by an undo. If the next week has already been
  // played, the organizer has to deal with that deliberately — losing results
  // to a button meant for "I locked too early" would be the worse accident.
  if ((nextMatches ?? []).some((m) => SETTLED.has(m.status as string))) {
    return {
      error: `Week ${week + 1} already has results, so undoing week ${week} would discard them. Clear those scores first.`,
    };
  }

  const { error: delErr } = await supabase
    .from("ladder_placements")
    .delete()
    .eq("competition_id", competitionId)
    .in("week", nextRound);
  if (delErr) return { error: delErr.message };

  // The drawn night goes with the ladder it was drawn from.
  if ((nextMatches ?? []).length > 0) {
    const { error: matchErr } = await supabase
      .from("matches")
      .delete()
      .eq("competition_id", competitionId)
      .in("round", nextRound);
    if (matchErr) return { error: matchErr.message };
  }

  // Put every team back in the tier it played that week in.
  const { data: thisWeek } = await supabase
    .from("ladder_placements")
    .select("team_id, division_id")
    .eq("competition_id", competitionId)
    .eq("week", week);
  for (const p of thisWeek ?? []) {
    const { error } = await supabase
      .from("teams")
      .update({ division_id: p.division_id })
      .eq("id", p.team_id as string);
    if (error) return { error: error.message };
  }

  revalidatePath("/orgs");
  return { success: true };
}
