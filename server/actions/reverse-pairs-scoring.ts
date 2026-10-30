"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { BONUS_LIMITS, parseBonusItems } from "@/lib/reverse-pairs/bonus";

type ActionError = { error: string };

const idSchema = z.string().uuid();

const scoringSchema = z.object({
  competitionId: idSchema,
  ranking: z.enum(["differential", "wins_pct"]),
  bonusItems: z
    .array(
      z.object({
        label: z
          .string()
          .trim()
          .min(1, "Name each bonus.")
          .max(BONUS_LIMITS.label, "That bonus name is too long."),
        points: z
          .number()
          .int("Bonus points are whole numbers.")
          .min(-BONUS_LIMITS.points)
          .max(BONUS_LIMITS.points),
      }),
    )
    .max(BONUS_LIMITS.items, `At most ${BONUS_LIMITS.items} bonuses.`)
    .refine(
      (items) => new Set(items.map((i) => i.label)).size === items.length,
      "Two bonuses have the same name.",
    ),
});

export type ReversePairsScoringInput = z.input<typeof scoringSchema>;

/**
 * How the standings rank, and which bonuses the organizer can award (0192).
 *
 * Removing a bonus here doesn't take back points already awarded: those rows
 * keep the points they were given, so a finished night can't be rewritten by
 * tidying the list for the next one.
 */
export async function updateReversePairsScoringAction(
  input: ReversePairsScoringInput,
): Promise<ActionError | { saved: true }> {
  const parsed = scoringSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: v.competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can change how standings rank." };
  }

  const { data, error } = await supabase
    .from("reverse_pairs_settings")
    .update({
      ranking: v.ranking,
      bonus_items: v.bonusItems.length ? v.bonusItems : null,
    })
    .eq("competition_id", v.competitionId)
    .select("competition_id");
  if (error || !data?.length) {
    if (error)
      console.error("[reverse-pairs] scoring update failed", error.message);
    return { error: "Those settings couldn't be saved." };
  }

  revalidatePath("/orgs");
  return { saved: true };
}

const awardSchema = z.object({
  competitionId: idSchema,
  teamId: idSchema,
  item: z.string().trim().min(1).max(BONUS_LIMITS.label),
  awarded: z.boolean(),
});

export type ReversePairsBonusInput = z.input<typeof awardSchema>;

/** Tick or untick one bonus for one pair. */
export async function setReversePairsBonusAction(
  input: ReversePairsBonusInput,
): Promise<ActionError | { saved: true }> {
  const parsed = awardSchema.safeParse(input);
  if (!parsed.success) return { error: "That bonus couldn't be saved." };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: v.competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can award bonus points." };
  }

  if (!v.awarded) {
    const { error } = await supabase
      .from("reverse_pairs_bonuses")
      .delete()
      .eq("competition_id", v.competitionId)
      .eq("team_id", v.teamId)
      .eq("item", v.item);
    if (error) {
      console.error("[reverse-pairs] bonus remove failed", error.message);
      return { error: "That bonus couldn't be removed." };
    }
    revalidatePath("/orgs");
    return { saved: true };
  }

  // The points come from the event's own list, never from the client.
  const { data: settings } = await supabase
    .from("reverse_pairs_settings")
    .select("bonus_items")
    .eq("competition_id", v.competitionId)
    .maybeSingle();
  const item = parseBonusItems(settings?.bonus_items).find(
    (i) => i.label === v.item,
  );
  if (!item) return { error: "That bonus isn't offered at this event." };

  const { error } = await supabase.from("reverse_pairs_bonuses").upsert(
    {
      competition_id: v.competitionId,
      team_id: v.teamId,
      item: item.label,
      points: item.points,
    },
    { onConflict: "team_id,item" },
  );
  if (error) {
    console.error("[reverse-pairs] bonus award failed", error.message);
    return {
      error: error.message.includes("not in this event")
        ? "That pair isn't in this event."
        : "That bonus couldn't be saved.",
    };
  }

  revalidatePath("/orgs");
  return { saved: true };
}
