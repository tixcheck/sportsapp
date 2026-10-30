"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { parseRules, RULE_LIMITS } from "@/lib/competition/rules";
import { ruleSectionSchema } from "@/lib/validations/rules";

type ActionError = { error: string };

const rulesSchema = z.object({
  competitionId: z.string().uuid(),
  rules: z
    .array(ruleSectionSchema)
    .max(RULE_LIMITS.sections, `Up to ${RULE_LIMITS.sections} rules.`),
});

/**
 * Save a league's rules (0188). The whole list is replaced: the editor holds
 * every section, so a save is the organizer's complete current version.
 * Plain text only, like the description — it renders on a public page.
 */
export async function updateRulesAction(
  input: z.input<typeof rulesSchema>,
): Promise<ActionError | { ok: true }> {
  const parsed = rulesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the rules." };
  }

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: parsed.data.competitionId,
  });
  if (isAdmin !== true) return { error: "Only an organizer can do that." };

  const { data: comp } = await supabase
    .from("competitions")
    .select("org_id, slug, type")
    .eq("id", parsed.data.competitionId)
    .maybeSingle();
  if (!comp) return { error: "Unknown competition." };
  const c = comp as { org_id: string; slug: string; type: string };

  // Same rules as reading, so what's stored is exactly what the tab shows.
  const rules = parseRules(parsed.data.rules);
  const { error } = await supabase
    .from("competitions")
    .update({ rules: rules.length ? rules : null })
    .eq("id", parsed.data.competitionId);
  if (error) {
    console.error("[rules] update failed");
    return { error: "The rules couldn't be saved. Please try again." };
  }

  revalidatePath(`/orgs/${c.org_id}`, "layout");
  revalidatePath(`/${c.type === "league" ? "l" : "t"}/${c.slug}`);
  return { ok: true };
}
