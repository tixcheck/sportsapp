"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  competitionId: z.string().uuid(),
  waived: z.boolean(),
});

export type WaivePlatformFeeInput = z.input<typeof schema>;

/**
 * Turn the platform's cut on or off for one competition.
 *
 * Platform admin only, enforced inside `set_platform_fee_waived` — an organizer
 * who could waive the fee on their own event would waive it on all of them, so
 * this is not theirs to set. The check here is defence in depth; the function
 * is the real gate.
 *
 * Existing charges are untouched. This changes what future registrations are
 * quoted and charged, not money already taken, which would need a refund rather
 * than a setting.
 */
export async function setPlatformFeeWaivedAction(
  input: WaivePlatformFeeInput,
): Promise<{ error: string } | { waived: boolean }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Check the request." };
  const { competitionId, waived } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_platform_fee_waived", {
    _competition_id: competitionId,
    _waived: waived,
  });
  if (error) {
    console.error("[platform-fee] waive failed", error.message);
    return { error: "That couldn't be changed. Please try again." };
  }

  revalidatePath("/admin");
  revalidatePath("/orgs");
  return { waived };
}
