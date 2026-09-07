"use server";

import { createHash } from "node:crypto";

import {
  isSignatureStyle,
  missingInitials,
  splitWaiverClauses,
} from "@/lib/waivers/clauses";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

type ActionError = { error: string };

const idSchema = z.string().uuid();

const draftSchema = z.object({
  orgId: idSchema,
  title: z.string().trim().min(2, "Give the waiver a title.").max(160),
  body: z
    .string()
    .trim()
    .min(50, "A waiver needs more text than that.")
    .max(20000),
});

export type WaiverDraftInput = z.input<typeof draftSchema>;

/**
 * Write a new waiver, as a draft.
 *
 * Always a new version rather than an edit: an approved waiver is frozen by the
 * database, and quietly amending the text somebody already agreed to is the one
 * thing a waiver system must never do.
 */
export async function saveWaiverDraftAction(
  input: WaiverDraftInput,
): Promise<ActionError | { waiverId: string; version: number }> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the waiver." };
  }
  const { orgId, title, body } = parsed.data;

  const supabase = await createClient();
  const { data: canManage } = await supabase.rpc("can_manage_org", {
    _org_id: orgId,
  });
  if (canManage !== true) {
    return { error: "Only an organization admin can write a waiver." };
  }

  const { data: latest } = await supabase
    .from("waivers")
    .select("version")
    .eq("org_id", orgId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = ((latest?.version as number | undefined) ?? 0) + 1;

  const { data, error } = await supabase
    .from("waivers")
    .insert({ org_id: orgId, title, body, version, status: "draft" })
    .select("id, version")
    .single();
  if (error || !data) {
    console.error("[waivers] draft insert failed", error?.message);
    return { error: "That couldn't be saved. Please try again." };
  }

  revalidatePath("/orgs");
  return { waiverId: data.id as string, version: data.version as number };
}

/**
 * Approve a draft, freezing its text.
 *
 * The checksum is computed inside the database function from the row as stored,
 * not from anything the browser sends — the whole point of the record is that
 * it proves what the text was.
 */
export async function approveWaiverAction(
  waiverId: string,
): Promise<ActionError | { approved: true }> {
  if (!idSchema.safeParse(waiverId).success) {
    return { error: "Unknown waiver." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_waiver", {
    _waiver_id: waiverId,
  });
  if (error) {
    return { error: error.message.replace(/^.*?:\s*/, "") };
  }
  revalidatePath("/orgs");
  return { approved: true };
}

const applySchema = z.object({
  competitionId: idSchema,
  /** An approved waiver, or null to switch the requirement off. */
  waiverId: idSchema.nullable(),
  /** Rostered players a team needs to be an entrant. Null = no requirement. */
  minRoster: z.number().int().min(1).max(30).nullable(),
  /** Ask signers to initial each numbered clause. */
  requireInitials: z.boolean().optional(),
});

export type ApplyWaiverInput = z.input<typeof applySchema>;

/**
 * Turn waivers on (or off) for one competition, and set the roster minimum.
 *
 * Both in one call because they are one decision: "a team is an entrant when it
 * has N players and they have all signed". Setting half of that is how you end
 * up with a two-person team on the schedule.
 */
export async function setCompetitionWaiverAction(
  input: ApplyWaiverInput,
): Promise<ActionError | { applied: true; teamsHeld: number }> {
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  }
  const { competitionId, waiverId, minRoster, requireInitials } = parsed.data;

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can change this." };
  }

  if (waiverId) {
    // Only an approved waiver can be required. A draft is still being written,
    // and requiring one would mean asking people to agree to a moving target.
    const { data: w } = await supabase
      .from("waivers")
      .select("status")
      .eq("id", waiverId)
      .maybeSingle();
    if (!w) return { error: "Waiver not found." };
    if (w.status !== "approved") {
      return { error: "Approve the waiver before requiring it." };
    }
  }

  const { error } = await supabase
    .from("competitions")
    .update({
      waiver_id: waiverId,
      min_roster_for_entry: minRoster,
      ...(requireInitials === undefined
        ? {}
        : { waiver_require_initials: requireInitials }),
    })
    .eq("id", competitionId);
  if (error) {
    console.error("[waivers] apply failed", error.message);
    return { error: "That couldn't be saved. Please try again." };
  }

  // Existing teams don't move on their own — the triggers fire on membership
  // and signature changes, not on the rule changing underneath them. So nudge
  // each one and report how many are now held back, which is the number the
  // organizer is about to be asked about.
  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("competition_id", competitionId)
    .neq("status", "withdrawn");

  for (const t of teams ?? []) {
    await supabase.rpc("sync_team_entry_status", { _team_id: t.id });
  }

  const { count } = await supabase
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("competition_id", competitionId)
    .eq("status", "pending_waiver");

  revalidatePath("/orgs");
  return { applied: true, teamsHeld: count ?? 0 };
}

const signSchema = z.object({
  competitionId: idSchema,
  waiverId: idSchema,
  /** Typed as a signature. Checked against nothing — it is a record of intent. */
  signedName: z
    .string()
    .trim()
    .min(2, "Type your full name to agree.")
    .max(120),
  /** The checksum of the text they were shown, echoed back. */
  bodySha256: z.string().regex(/^[a-f0-9]{64}$/, "That agreement looks stale."),
  /** Initials per clause number, when the competition asks for them. */
  clauseInitials: z.record(z.string(), z.string().trim().max(8)).optional(),
  /** Which rendering of their name they picked. */
  signatureStyle: z.string().trim().max(20).optional(),
});

export type SignWaiverInput = z.input<typeof signSchema>;

/**
 * Record that the signed-in player agreed to a waiver.
 *
 * The checksum they were shown is verified against the stored text before the
 * record is written. Not because a mismatch is likely, but because the record
 * is only worth anything if it says what they actually read — and a stale tab
 * open since before a new version is exactly how that goes wrong.
 */
export async function signWaiverAction(
  input: SignWaiverInput,
): Promise<ActionError | { signed: true }> {
  const parsed = signSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const {
    competitionId,
    waiverId,
    signedName,
    bodySha256,
    clauseInitials,
    signatureStyle,
  } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { data: waiver } = await supabase
    .from("waivers")
    .select("body, status")
    .eq("id", waiverId)
    .maybeSingle();
  if (!waiver) return { error: "Waiver not found." };
  if (waiver.status !== "approved") {
    return { error: "That waiver isn't in force." };
  }

  const actual = createHash("sha256")
    .update(waiver.body as string, "utf8")
    .digest("hex");
  if (actual !== bodySha256) {
    return {
      error:
        "The waiver has been updated since this page loaded. Reload and read it again before agreeing.",
    };
  }

  // Whether THIS competition asks for clause-by-clause initials, and what the
  // document's clauses actually are. Both re-derived here: the browser sent a
  // set of initials, and a record assembled from whatever it sent would show
  // only that it said so.
  const { data: comp } = await supabase
    .from("competitions")
    .select("waiver_require_initials")
    .eq("id", competitionId)
    .maybeSingle();
  const wantsInitials =
    (comp as { waiver_require_initials?: boolean } | null)
      ?.waiver_require_initials === true;

  const { clauses } = splitWaiverClauses(waiver.body as string);
  let initials: Record<string, string> | null = null;
  let clauseCount: number | null = null;
  let style: string | null = null;

  if (wantsInitials && clauses.length > 0) {
    const given = clauseInitials ?? {};
    const missing = missingInitials(clauses, given);
    if (missing.length > 0) {
      return {
        error: `Initial every section to agree — ${missing.length === 1 ? "section" : "sections"} ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} still blank.`,
      };
    }
    // Only the clauses this document has: an extra key would be a record of
    // initialling something that isn't in the agreement.
    initials = Object.fromEntries(
      clauses.map((c) => [String(c.number), given[String(c.number)]!.trim()]),
    );
    clauseCount = clauses.length;
  }

  if (signatureStyle) {
    if (!isSignatureStyle(signatureStyle)) {
      return { error: "Pick one of the signature styles offered." };
    }
    style = signatureStyle;
  }

  // Coarse, and only this. No IP address: it would add little to a record that
  // is already tied to an authenticated account, and it is personal data we
  // would then have to justify keeping.
  const ua = (await headers()).get("user-agent")?.slice(0, 400) ?? null;

  const { error } = await supabase.from("waiver_acceptances").insert({
    waiver_id: waiverId,
    competition_id: competitionId,
    user_id: user.id,
    signed_name: signedName,
    body_sha256: actual,
    user_agent: ua,
    clause_initials: initials,
    clause_count: clauseCount,
    signature_style: style,
  });
  if (error) {
    // The unique constraint means they already signed — not worth an error.
    if (error.code === "23505") return { signed: true };
    console.error("[waivers] sign failed", error.message);
    return { error: "That couldn't be recorded. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/orgs");
  return { signed: true };
}
