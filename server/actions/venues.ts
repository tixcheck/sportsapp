"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

type ActionError = { error: string };

const idSchema = z.string().uuid();

const venueSchema = z.object({
  orgId: idSchema,
  name: z
    .string()
    .trim()
    .min(1, "Give the venue a name.")
    .max(80, "Venue names are 80 characters or fewer."),
  address: z.string().trim().max(200).optional(),
  /** Directions printed on the PUBLIC schedule — never door codes. */
  entryNotes: z.string().trim().max(400).optional(),
  doorsNote: z.string().trim().max(120).optional(),
});

/**
 * Confirm the caller administers this org.
 *
 * Defense in depth: the `venues_write` RLS policy enforces the same thing, so a
 * forged org id fails at the database even if this check were bypassed. This
 * layer exists to return a sentence instead of a Postgres error.
 */
async function requireOrgAdmin(orgId: string): Promise<ActionError | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (membership as { role?: string } | null)?.role;
  if (role !== "owner" && role !== "admin") {
    return { error: "Only an organization admin can manage venues." };
  }
  return null;
}

/** Add a gym to the org's list. */
export async function createVenueAction(
  input: z.input<typeof venueSchema>,
): Promise<ActionError | { ok: true; id: string }> {
  const parsed = venueSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  const denied = await requireOrgAdmin(parsed.data.orgId);
  if (denied) return denied;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("venues")
    .insert({
      org_id: parsed.data.orgId,
      name: parsed.data.name,
      address: parsed.data.address || null,
      entry_notes: parsed.data.entryNotes || null,
      doors_note: parsed.data.doorsNote || null,
    })
    .select("id")
    .single();

  if (error) {
    // The (org_id, name) unique index is the guard against a season's games
    // being split across two rows for the same gym.
    if (error.code === "23505") {
      return { error: "You already have a venue with that name." };
    }
    console.error("[venues] insert failed");
    return { error: "That venue couldn't be saved. Please try again." };
  }

  revalidatePath(`/orgs/${parsed.data.orgId}`);
  return { ok: true, id: (data as { id: string }).id };
}

const updateSchema = venueSchema.extend({ id: idSchema });

export async function updateVenueAction(
  input: z.input<typeof updateSchema>,
): Promise<ActionError | { ok: true }> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  const denied = await requireOrgAdmin(parsed.data.orgId);
  if (denied) return denied;

  const supabase = await createClient();
  const { error } = await supabase
    .from("venues")
    .update({
      name: parsed.data.name,
      address: parsed.data.address || null,
      entry_notes: parsed.data.entryNotes || null,
      doors_note: parsed.data.doorsNote || null,
    })
    .eq("id", parsed.data.id)
    .eq("org_id", parsed.data.orgId);

  if (error) {
    if (error.code === "23505") {
      return { error: "You already have a venue with that name." };
    }
    console.error("[venues] update failed");
    return { error: "That venue couldn't be saved. Please try again." };
  }

  revalidatePath(`/orgs/${parsed.data.orgId}`);
  return { ok: true };
}

/**
 * Remove a venue from the org's list.
 *
 * Games played there are NOT deleted — the FK is `on delete set null`, so they
 * fall back to the competition's own venue and can be re-pointed. Deleting a
 * gym from a list should never delete history.
 */
export async function deleteVenueAction(
  orgId: string,
  venueId: string,
): Promise<ActionError | { ok: true; affectedMatches: number }> {
  if (
    !idSchema.safeParse(orgId).success ||
    !idSchema.safeParse(venueId).success
  ) {
    return { error: "Unknown venue." };
  }
  const denied = await requireOrgAdmin(orgId);
  if (denied) return denied;

  const supabase = await createClient();
  const { count } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", venueId);

  const { error } = await supabase
    .from("venues")
    .delete()
    .eq("id", venueId)
    .eq("org_id", orgId);
  if (error) {
    console.error("[venues] delete failed");
    return { error: "That venue couldn't be removed. Please try again." };
  }

  revalidatePath(`/orgs/${orgId}`);
  return { ok: true, affectedMatches: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Assigning venues to a league's courts
// ---------------------------------------------------------------------------

const assignSchema = z.object({
  competitionId: idSchema,
  /** One entry per court, in the league's existing court order. */
  courts: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(64),
        prime: z.boolean(),
        venueId: idSchema.nullable(),
      }),
    )
    .max(64),
});

/**
 * Set which venue each of a league's courts is in, and stamp the change onto
 * the games already scheduled on those courts.
 *
 * The matches have to be updated too, not just the court list: `matches.venue_id`
 * is what every view reads, and a court list that disagrees with the schedule is
 * the drift this whole feature exists to remove. Matching is by court label,
 * which is safe here precisely because the labels within one league are still
 * unique until an organizer introduces a second venue.
 */
export async function assignCourtVenuesAction(
  input: z.input<typeof assignSchema>,
): Promise<ActionError | { ok: true; updatedMatches: number }> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the courts." };
  }

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: parsed.data.competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only an organizer can do that." };
  }

  const { data: comp } = await supabase
    .from("competitions")
    .select("org_id, slug, type")
    .eq("id", parsed.data.competitionId)
    .maybeSingle();
  if (!comp) return { error: "Unknown competition." };
  const c = comp as { org_id: string; slug: string; type: string };

  // Every venue named must belong to this org — otherwise an organizer could
  // point their courts at another org's building.
  const wanted = [
    ...new Set(parsed.data.courts.map((x) => x.venueId).filter(Boolean)),
  ] as string[];
  if (wanted.length > 0) {
    const { data: owned } = await supabase
      .from("venues")
      .select("id")
      .eq("org_id", c.org_id)
      .in("id", wanted);
    const ownedIds = new Set(
      ((owned ?? []) as { id: string }[]).map((v) => v.id),
    );
    if (wanted.some((id) => !ownedIds.has(id))) {
      return { error: "That venue doesn't belong to this organization." };
    }
  }

  const { error: settingsError } = await supabase
    .from("league_settings")
    .update({ court_list: parsed.data.courts })
    .eq("competition_id", parsed.data.competitionId);
  if (settingsError) {
    console.error("[venues] court_list update failed");
    return { error: "The courts couldn't be saved. Please try again." };
  }

  let updatedMatches = 0;
  for (const court of parsed.data.courts) {
    const { data: touched } = await supabase
      .from("matches")
      .update({ venue_id: court.venueId })
      .eq("competition_id", parsed.data.competitionId)
      .eq("court", court.label)
      .select("id");
    updatedMatches += touched?.length ?? 0;
  }

  revalidatePath(`/orgs/${c.org_id}`);
  revalidatePath(`/${c.type === "league" ? "l" : "t"}/${c.slug}`);
  return { ok: true, updatedMatches };
}
