"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
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
