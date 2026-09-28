"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { drawSessionPlayoff } from "@/lib/playoff/session-playoff";
import { PLAYOFF_FORMATS } from "@/lib/scheduler/playoff-formats";

const schema = z.object({
  competitionId: z.string().uuid(),
  night: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a playoff night."),
  formatId: z.enum(PLAYOFF_FORMATS.map((f) => f.id) as [string, ...string[]], {
    message: "Pick a playoff format.",
  }),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Enter a start time."),
  slotMinutes: z
    .number()
    .int("Whole minutes only.")
    .min(20, "At least 20 minutes a game.")
    .max(180, "At most 3 hours a game."),
  seeds: z.array(z.string().uuid()).max(32).optional(),
});

export type SessionPlayoffInput = z.input<typeof schema>;

/**
 * Draw one session's playoff night in a named format (Playoff Format 1, …).
 * See lib/playoff/session-playoff.ts for what it replaces and when it refuses.
 */
export async function drawSessionPlayoffAction(
  input: SessionPlayoffInput,
): Promise<{ error: string } | { games: number }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the playoff." };
  }

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: parsed.data.competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can draw the playoffs." };
  }

  const res = await drawSessionPlayoff(supabase, parsed.data);
  if ("error" in res) return res;

  revalidatePath("/orgs");
  const { data: comp } = await supabase
    .from("competitions")
    .select("slug")
    .eq("id", parsed.data.competitionId)
    .maybeSingle();
  if (comp?.slug) revalidatePath(`/l/${comp.slug}`);
  return { games: res.games };
}
