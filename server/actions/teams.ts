"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

type ClaimResult = { error: string } | { success: true };

/**
 * Claim a team via an invite token. Delegates to the claim_team SECURITY
 * DEFINER rpc (the claimer isn't a competition admin, so this can't go through
 * normal teams/team_members RLS).
 */
export async function claimTeamAction(token: string): Promise<ClaimResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to claim a team." };

  const { error } = await supabase.rpc("claim_team", { _token: token });
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}
