"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { endDatePassed } from "@/lib/competition/completion";
import {
  scoringSettingsSchema,
  type ScoringSettingsInput,
} from "@/lib/validations/scoring";

type ActionResult = { error: string } | { success: true };

/** Update who may enter scores + whether confirmation is required (admin only). */
export async function updateScoringSettingsAction(
  competitionId: string,
  values: ScoringSettingsInput,
): Promise<ActionResult> {
  const parsed = scoringSettingsSchema.safeParse(values);
  if (!parsed.success) return { error: "Invalid settings." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("competitions")
    .update({
      allow_captain_entry: parsed.data.allowCaptainEntry,
      allow_ref_entry: parsed.data.allowRefEntry,
      allow_organizer_entry: parsed.data.allowOrganizerEntry,
      require_confirmation: parsed.data.requireConfirmation,
    })
    .eq("id", competitionId);
  if (error) return { error: error.message };

  revalidatePath("/orgs");
  return { success: true };
}

/**
 * Mark a competition finished (or reopen it), admin only. Completing drops it
 * off players' dashboards and My Matches even if some games were never scored —
 * the organizer's call that the event is over. Reopening restores it to the
 * published ("open") state.
 */
export async function setCompetitionCompletedAction(
  competitionId: string,
  completed: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can change this." };
  }

  // Completing is gated until the event's last date has passed (reopening isn't).
  if (completed) {
    const { data: comp } = await supabase
      .from("competitions")
      .select("type, start_date, end_date, timezone")
      .eq("id", competitionId)
      .single();
    if (!comp) return { error: "Competition not found." };

    let lastDay = comp.end_date ?? comp.start_date;
    if (comp.type === "tournament") {
      const { data: ts } = await supabase
        .from("tournament_settings")
        .select("days")
        .eq("competition_id", competitionId)
        .single();
      const days = (ts?.days as { date: string }[] | null) ?? null;
      if (days?.length) {
        lastDay =
          [...days]
            .map((d) => d.date)
            .sort()
            .at(-1) ?? lastDay;
      }
    }
    if (!endDatePassed(lastDay, comp.timezone)) {
      return {
        error: "You can mark this completed once its last date has passed.",
      };
    }
  }

  const { error } = await supabase
    .from("competitions")
    .update({ status: completed ? "completed" : "open" })
    .eq("id", competitionId);
  if (error) return { error: error.message };

  revalidatePath("/orgs");
  revalidatePath("/dashboard");
  revalidatePath("/my-matches");
  return { success: true };
}
