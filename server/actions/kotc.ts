"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { slugify, uniqueSlug } from "@/lib/utils/slug";
import type { MatchFormat } from "@/lib/db/schema";
import {
  addKotcPairSchema,
  createKotcSchema,
  updateKotcSettingsSchema,
  type AddKotcPairInput,
  type CreateKotcInput,
  type UpdateKotcSettingsInput,
} from "@/lib/validations/kotc";

const DEFAULT_TIMEZONE = "America/Toronto";

// KotC scores individual rallies, not sets; competitions.match_format is NOT
// NULL, so we store a representative single-target format (rally to 11). It is
// not used by the KotC engine — gameplay config lives in kotc_settings.
const KOTC_MATCH_FORMAT: MatchFormat = {
  bestOf: 1,
  setsToPoints: [11],
  winBy: 1,
};

type ActionError = { error: string };

/** Admin gate shared by every mutating KotC action (RLS is the primary layer). */
async function assertKotcAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitionId: string,
): Promise<ActionError | null> {
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  return isAdmin === true ? null : { error: "Only the organizer can do that." };
}

/**
 * Create a King of the Court competition (beach 2s): the competition row +
 * kotc_settings + the seeding and elimination stages. Mirrors
 * createTournamentAction's RLS-safe insert…RETURNING.
 */
export async function createKotcCompetitionAction(
  orgId: string,
  values: CreateKotcInput,
): Promise<ActionError | void> {
  const parsed = createKotcSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check the form." };
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const base = slugify(v.name);
  const { data: existing } = await supabase
    .from("competitions")
    .select("slug")
    .or(`slug.eq.${base},slug.like.${base}-%`);
  const slug = uniqueSlug(base, new Set((existing ?? []).map((r) => r.slug)));

  const { data: comp, error } = await supabase
    .from("competitions")
    .insert({
      org_id: orgId,
      slug,
      name: v.name,
      type: "kotc",
      sport: "beach2",
      status: "draft",
      venue: v.venue || null,
      timezone: DEFAULT_TIMEZONE,
      match_format: KOTC_MATCH_FORMAT,
      visibility: "private",
    })
    .select("id")
    .single();
  if (error || !comp) {
    return { error: error?.message ?? "Could not create the competition." };
  }

  const { error: settingsError } = await supabase.from("kotc_settings").insert({
    competition_id: comp.id,
    pairs_per_pool: v.pairsPerPool,
    rounds_per_session: v.roundsPerSession,
    round_minutes: v.roundMinutes,
    point_cap: v.pointCap,
    seeding_round_count: v.seedingRoundCount,
    seed_metric: v.seedMetric,
  });
  if (settingsError) return { error: settingsError.message };

  // Seeding rounds 1..N, then a single elimination stage.
  const stages: {
    competition_id: string;
    ordinal: number;
    kind: "seeding" | "elimination";
    name: string;
  }[] = Array.from({ length: v.seedingRoundCount }, (_, i) => ({
    competition_id: comp.id,
    ordinal: i + 1,
    kind: "seeding",
    name: `Round ${i + 1}`,
  }));
  stages.push({
    competition_id: comp.id,
    ordinal: v.seedingRoundCount + 1,
    kind: "elimination",
    name: "Elimination",
  });
  const { error: stageError } = await supabase
    .from("kotc_stages")
    .insert(stages);
  if (stageError) return { error: stageError.message };

  revalidatePath(`/orgs/${orgId}`);
  redirect(`/orgs/${orgId}/kotc/${comp.id}`);
}

/** Edit KotC settings post-creation (seeding-round count is fixed). */
export async function updateKotcSettingsAction(
  competitionId: string,
  values: UpdateKotcSettingsInput,
): Promise<ActionError | { success: true }> {
  const parsed = updateKotcSettingsSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check the form." };
  const v = parsed.data;

  const supabase = await createClient();
  const denied = await assertKotcAdmin(supabase, competitionId);
  if (denied) return denied;

  const { error: compErr } = await supabase
    .from("competitions")
    .update({ name: v.name, venue: v.venue || null })
    .eq("id", competitionId)
    .eq("type", "kotc");
  if (compErr) return { error: compErr.message };

  const { error: setErr } = await supabase
    .from("kotc_settings")
    .update({
      pairs_per_pool: v.pairsPerPool,
      rounds_per_session: v.roundsPerSession,
      round_minutes: v.roundMinutes,
      point_cap: v.pointCap,
      seed_metric: v.seedMetric,
    })
    .eq("competition_id", competitionId);
  if (setErr) return { error: setErr.message };

  revalidatePath("/orgs");
  return { success: true };
}

/** Add a pair (a beach2 team, name only) to the competition roster. */
export async function addKotcPairAction(
  competitionId: string,
  values: AddKotcPairInput,
): Promise<ActionError | { teamId: string }> {
  const parsed = addKotcPairSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check the form." };

  const supabase = await createClient();
  const denied = await assertKotcAdmin(supabase, competitionId);
  if (denied) return denied;

  const { data: team, error } = await supabase
    .from("teams")
    .insert({ competition_id: competitionId, name: parsed.data.name })
    .select("id")
    .single();
  if (error || !team) return { error: error?.message ?? "Could not add pair." };

  revalidatePath("/orgs");
  return { teamId: team.id };
}
