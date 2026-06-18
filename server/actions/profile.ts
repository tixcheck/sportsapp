"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  updateProfileSchema,
  type UpdateProfileInput,
} from "@/lib/validations/org";

type ActionResult = { error: string } | { success: true };

export async function updateProfileAction(
  values: UpdateProfileInput,
): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check your details." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("users")
    .update({
      display_name: parsed.data.displayName,
      avatar_url: parsed.data.avatarUrl ? parsed.data.avatarUrl : null,
    })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/profile");
  return { success: true };
}

export interface NotificationPrefs {
  notifyResults: boolean;
  notifyScheduleChanges: boolean;
  notifyWeekly: boolean;
}

/** Update the signed-in user's notification preferences (RLS self-update). */
export async function updateNotificationPrefsAction(
  prefs: NotificationPrefs,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("users")
    .update({
      notify_results: prefs.notifyResults,
      notify_schedule_changes: prefs.notifyScheduleChanges,
      notify_weekly: prefs.notifyWeekly,
    })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/profile");
  return { success: true };
}
