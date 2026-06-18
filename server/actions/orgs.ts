"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
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
  revalidatePath("/dashboard");
}
