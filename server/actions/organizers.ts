"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

type Result = { error: string } | { ok: true };

const idSchema = z.string().uuid();
const emailSchema = z.string().trim().toLowerCase().email();

/** The CLAUDE.md rule: every action input through zod before it's used. */
function invalid(id: string, other: { email?: string; userId?: string }) {
  if (!idSchema.safeParse(id).success) return { error: "Unknown event." };
  if (other.email !== undefined && !emailSchema.safeParse(other.email).success)
    return { error: "Enter a valid email address." };
  if (other.userId !== undefined && !idSchema.safeParse(other.userId).success)
    return { error: "Unknown person." };
  return null;
}

/** Map a Postgres rpc error to organizer-facing copy. */
function mapError(message: string): string {
  if (/no account with that email/i.test(message)) {
    return "No account with that email yet — they need to sign up first, then you can add them.";
  }
  if (/not authorized/i.test(message)) {
    return "Only the organization's owner or an admin can do this.";
  }
  return message;
}

export async function addOrgOrganizerAction(
  orgId: string,
  email: string,
): Promise<Result> {
  const bad = invalid(orgId, { email });
  if (bad) return bad;
  const supabase = await createClient();
  const { error } = await supabase.rpc("grant_org_organizer", {
    _org_id: orgId,
    _email: email.trim(),
  });
  if (error) return { error: mapError(error.message) };
  revalidatePath(`/orgs/${orgId}`);
  return { ok: true };
}

export async function removeOrgOrganizerAction(
  orgId: string,
  userId: string,
): Promise<Result> {
  const bad = invalid(orgId, { userId });
  if (bad) return bad;
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_org_organizer", {
    _org_id: orgId,
    _user_id: userId,
  });
  if (error) return { error: mapError(error.message) };
  revalidatePath(`/orgs/${orgId}`);
  return { ok: true };
}

export async function addCompetitionAdminAction(
  competitionId: string,
  email: string,
): Promise<Result> {
  const bad = invalid(competitionId, { email });
  if (bad) return bad;
  const supabase = await createClient();
  const { error } = await supabase.rpc("grant_competition_admin", {
    _competition_id: competitionId,
    _email: email.trim(),
  });
  if (error) return { error: mapError(error.message) };
  revalidatePath("/orgs");
  return { ok: true };
}

export async function removeCompetitionAdminAction(
  competitionId: string,
  userId: string,
): Promise<Result> {
  const bad = invalid(competitionId, { userId });
  if (bad) return bad;
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_competition_admin", {
    _competition_id: competitionId,
    _user_id: userId,
  });
  if (error) return { error: mapError(error.message) };
  revalidatePath("/orgs");
  return { ok: true };
}

/** Scorekeepers (0168): scores only, in one league. Any league admin may add. */
export async function addScorekeeperAction(
  competitionId: string,
  email: string,
): Promise<Result> {
  const bad = invalid(competitionId, { email });
  if (bad) return bad;
  const supabase = await createClient();
  const { error } = await supabase.rpc("grant_competition_scorekeeper", {
    _competition_id: competitionId,
    _email: email.trim(),
  });
  if (error) return { error: mapError(error.message) };
  revalidatePath("/orgs");
  return { ok: true };
}

export async function removeScorekeeperAction(
  competitionId: string,
  userId: string,
): Promise<Result> {
  const bad = invalid(competitionId, { userId });
  if (bad) return bad;
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_competition_scorekeeper", {
    _competition_id: competitionId,
    _user_id: userId,
  });
  if (error) return { error: mapError(error.message) };
  revalidatePath("/orgs");
  return { ok: true };
}
