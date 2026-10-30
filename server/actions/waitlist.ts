"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

type ActionError = { error: string };

const idSchema = z.string().uuid();

const joinSchema = z.object({
  competitionId: idSchema,
  divisionId: idSchema.nullable().optional(),
  teamName: z.string().trim().min(1, "Give your team a name.").max(80),
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("That email doesn't look right."),
  playerEmails: z.array(z.string().trim().email()).max(30).default([]),
});

/**
 * Join the queue for a full competition or tier.
 *
 * No payment is taken. A place in a queue is not an entry, and charging for one
 * that may never be offered is indefensible — the database refuses to queue
 * anyone for an event that still has room, so the two can't be confused.
 */
export async function joinWaitlistAction(
  input: z.input<typeof joinSchema>,
): Promise<ActionError | { entryId: string }> {
  const parsed = joinSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_waitlist", {
    _competition_id: v.competitionId,
    _division_id: v.divisionId ?? null,
    _team_name: v.teamName,
    _contact_email: v.contactEmail,
    _player_emails: v.playerEmails,
  });

  if (error || typeof data !== "string") {
    const message = error?.message ?? "";
    // These are things the person can act on; anything else is ours to hide.
    if (
      message.includes("still spots left") ||
      message.includes("signed in") ||
      message.includes("Registration is not open")
    ) {
      return { error: message };
    }
    if (message.includes("waitlist_entries_one_live_per_user")) {
      return { error: "You're already on the waitlist for this event." };
    }
    console.error("[waitlist] join failed");
    return { error: "That couldn't be saved. Please try again." };
  }

  await revalidateFor(supabase, v.competitionId);
  return { entryId: data };
}

/**
 * Turn a live offer into a real team.
 *
 * The registration itself happens in `register_team`, called from inside
 * `claim_waitlist_spot` — a team that waited must be indistinguishable from one
 * that walked up, invites and payment state included.
 */
export async function claimWaitlistSpotAction(
  token: string,
): Promise<ActionError | { teamId: string }> {
  if (!token || token.length < 16) return { error: "That link is not valid." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_waitlist_spot", {
    _token: token,
  });

  if (error || typeof data !== "string") {
    const message = error?.message ?? "";
    if (
      message.includes("expired") ||
      message.includes("already been claimed") ||
      message.includes("not valid") ||
      message.includes("signed in")
    ) {
      return { error: message };
    }
    if (message.includes("full")) {
      // The spot went while they were deciding. Shouldn't happen — an offer
      // holds its spot — but a clear message beats a stack trace.
      return {
        error:
          "That spot is no longer available. Get in touch with the organizer.",
      };
    }
    console.error("[waitlist] claim failed");
    return { error: "That couldn't be completed. Please try again." };
  }

  revalidatePath("/orgs");
  return { teamId: data };
}

const statusSchema = z.object({
  entryId: idSchema,
  status: z.enum(["removed", "waiting"]),
});

/** Organizer housekeeping: take someone out of the queue, or put them back. */
export async function setWaitlistEntryStatusAction(
  input: z.input<typeof statusSchema>,
): Promise<ActionError | { ok: true }> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the selection." };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("waitlist_entries")
    .select("competition_id")
    .eq("id", parsed.data.entryId)
    .maybeSingle();
  if (!row) return { error: "Unknown entry." };

  const { error } = await supabase
    .from("waitlist_entries")
    .update({
      status: parsed.data.status,
      // Returning someone to the queue must drop any dead offer with them, or
      // the row would claim to be waiting while still holding a token.
      offered_at: null,
      offer_expires_at: null,
      claim_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.entryId);

  if (error) {
    console.error("[waitlist] status update failed");
    return { error: "That couldn't be saved. Please try again." };
  }

  await revalidateFor(
    supabase,
    (row as { competition_id: string }).competition_id,
  );
  return { ok: true };
}

type Client = Awaited<ReturnType<typeof createClient>>;

async function revalidateFor(supabase: Client, competitionId: string) {
  const { data } = await supabase
    .from("competitions")
    .select("slug, type, org_id")
    .eq("id", competitionId)
    .maybeSingle();
  const c = data as { slug: string; type: string; org_id: string } | null;
  if (!c) return;
  revalidatePath(`/orgs/${c.org_id}`);
  revalidatePath(`/register/${c.slug}`);
}
