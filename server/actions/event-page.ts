"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

type ActionError = { error: string };

const blurbSchema = z.object({
  competitionId: z.string().uuid(),
  description: z
    .string()
    .trim()
    .max(4000, "Keep the description under 4000 characters.")
    .optional(),
  bannerUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), {
      message: "The banner needs to be a full http:// or https:// link.",
    })
    .optional(),
});

/**
 * Set the blurb and banner shown on a competition's registration page.
 *
 * The description is stored and rendered as PLAIN TEXT — blank lines make
 * paragraphs. v0 allows no rich text, and a page open to the public internet is
 * the last place to start accepting markup. The URL is checked for an http(s)
 * scheme here and again by a check constraint, because it ends up in an `<img
 * src>` on that same public page.
 */
export async function updateEventBlurbAction(
  input: z.input<typeof blurbSchema>,
): Promise<ActionError | { ok: true }> {
  const parsed = blurbSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
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

  const { error } = await supabase
    .from("competitions")
    .update({
      description: parsed.data.description || null,
      banner_url: parsed.data.bannerUrl || null,
    })
    .eq("id", parsed.data.competitionId);

  if (error) {
    console.error("[event-page] blurb update failed");
    return { error: "That couldn't be saved. Please try again." };
  }

  revalidatePath(`/orgs/${c.org_id}`);
  revalidatePath(`/register/${c.slug}`);
  revalidatePath(`/${c.type === "league" ? "l" : "t"}/${c.slug}`);
  return { ok: true };
}
