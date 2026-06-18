"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

type ActionResult = { error: string } | { success: true };

/** A general user requests organizer access (rpc can only set 'pending'). */
export async function requestOrganizerAction(
  note: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.rpc("request_organizer", {
    _note: note.trim() ? note.trim() : null,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

/** Platform admin approves/denies a request (rpc is gated on is_platform_admin). */
export async function decideOrganizerRequestAction(
  requestId: string,
  approve: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.rpc("decide_organizer_request", {
    _request_id: requestId,
    _approve: approve,
    _note: null,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/organizer-requests");
  revalidatePath("/dashboard");
  return { success: true };
}
