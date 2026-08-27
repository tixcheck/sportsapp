"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { isSafeImageUrl } from "@/lib/uploads/image";
import { CURRENT_ORG_COOKIE } from "@/lib/org/cookies";
import { slugify, uniqueSlug } from "@/lib/utils/slug";
import { createOrgSchema, type CreateOrgInput } from "@/lib/validations/org";

type ActionError = { error: string };

export async function createOrganizationAction(
  values: CreateOrgInput,
): Promise<ActionError | void> {
  const parsed = createOrgSchema.safeParse(values);
  if (!parsed.success) return { error: "Enter an organization name." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  // Organizer gating: only approved organizers may create an org. The rpc + RLS
  // enforce this at the data layer; this is a friendly early check.
  const { data: approved } = await supabase.rpc("is_approved_organizer");
  if (approved !== true) {
    return {
      error:
        "You need organizer approval to create an organization. Request it from your dashboard.",
    };
  }

  const base = slugify(parsed.data.name);

  // Find taken slugs that could collide, then pick the first free variant.
  const { data: existing } = await supabase
    .from("organizations")
    .select("slug")
    .or(`slug.eq.${base},slug.like.${base}-%`);
  const taken = new Set((existing ?? []).map((r) => r.slug as string));
  const slug = uniqueSlug(base, taken);

  // SECURITY DEFINER rpc writes the org + the owner's first membership
  // atomically (the org_members RLS check would otherwise deadlock).
  const { data: orgId, error } = await supabase.rpc("create_organization", {
    _name: parsed.data.name,
    _slug: slug,
  });
  if (error) return { error: error.message };

  const cookieStore = await cookies();
  cookieStore.set(CURRENT_ORG_COOKIE, orgId as string, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function setCurrentOrgAction(orgId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CURRENT_ORG_COOKIE, orgId, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  // Switching org takes you to that org's page — otherwise selecting one only
  // moved the checkmark (nothing reads the cookie except the switcher itself).
  redirect(`/orgs/${orgId}`);
}

const logoSchema = z.object({
  orgId: z.string().uuid(),
  logoUrl: z
    .string()
    .trim()
    .max(500, "That link is too long.")
    .refine((v) => v === "" || isSafeImageUrl(v), {
      message: "The logo needs to be a full http:// or https:// link.",
    }),
});

/**
 * Set the organization's logo, shown on its public registration pages.
 *
 * The URL is validated rather than merely length-checked because it ends up in
 * an `<img src>` on a page open to the public internet — `isSafeImageUrl`
 * rejects `javascript:` and friends, which `new URL()` parses perfectly
 * happily. Uploaded files come back as ordinary Supabase https links, so the
 * same check covers both routes.
 */
export async function updateOrgLogoAction(
  input: z.input<typeof logoSchema>,
): Promise<ActionError | { ok: true }> {
  const parsed = logoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the link." };
  }

  const supabase = await createClient();
  // Defence in depth — RLS on `organizations` requires org admin as well.
  // `can_manage_org` so the platform admin can fix an organization's logo from
  // the admin portal without first joining it.
  const { data: allowed, error: checkErr } = await supabase.rpc(
    "can_manage_org",
    { _org_id: parsed.data.orgId },
  );
  if (checkErr) {
    console.error("[orgs] permission check failed", checkErr.message);
    return { error: "That couldn't be saved. Please try again." };
  }
  if (allowed !== true) {
    return { error: "Only an organization admin can change the logo." };
  }

  const { error } = await supabase
    .from("organizations")
    .update({ logo_url: parsed.data.logoUrl || null })
    .eq("id", parsed.data.orgId);
  if (error) {
    console.error("[orgs] logo update failed");
    return { error: "That couldn't be saved. Please try again." };
  }

  revalidatePath(`/orgs/${parsed.data.orgId}`);
  revalidatePath("/register", "layout");
  return { ok: true };
}
