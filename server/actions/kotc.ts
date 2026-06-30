"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { slugify, uniqueSlug } from "@/lib/utils/slug";
import { rankKotcPool } from "@/lib/kotc/ranking";
import {
  computeKotcSeeds,
  normalizedPlacement,
  type StagePlacement,
} from "@/lib/kotc/seed";
import { repoolForRound2, type RepoolPair } from "@/lib/kotc/repool";
import { poolName } from "@/lib/scheduler/pools";
import type { MatchFormat } from "@/lib/db/schema";
import {
  addKotcPairSchema,
  assignKotcPoolsSchema,
  createKotcSchema,
  repoolSchema,
  submitKotcResultsSchema,
  updateKotcSettingsSchema,
  type AddKotcPairInput,
  type AssignKotcPoolsInput,
  type CreateKotcInput,
  type RepoolInput,
  type SubmitKotcResultsInput,
  type UpdateKotcSettingsInput,
} from "@/lib/validations/kotc";

/** A reviewable pool proposal the UI tweaks, then commits via assignKotcPoolsAction. */
export interface KotcPoolProposal {
  stageId: string;
  pools: { name: string; teamIds: string[] }[];
  /** Residual repeat-poolmate count (re-pool only; 0 = no rematches). */
  repeats?: number;
}

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

/**
 * Assign pairs into a stage's pools (manual for Round 1; the reviewed output of
 * re-pool / elimination seeding for later stages). Replaces any existing pools
 * for the stage (cascade clears their pairs/events/results), then inserts the
 * new pools + memberships.
 */
export async function assignKotcPoolsAction(
  values: AssignKotcPoolsInput,
): Promise<ActionError | { poolCount: number; pairCount: number }> {
  const parsed = assignKotcPoolsSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check the pools." };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: stage } = await supabase
    .from("kotc_stages")
    .select("id, competition_id")
    .eq("id", v.stageId)
    .single();
  if (!stage) return { error: "Stage not found." };
  const competitionId = stage.competition_id as string;

  const denied = await assertKotcAdmin(supabase, competitionId);
  if (denied) return denied;

  // Every pair appears once and belongs to this competition.
  const teamIds = v.pools.flatMap((p) => p.teamIds);
  if (new Set(teamIds).size !== teamIds.length) {
    return { error: "A pair was placed in more than one pool." };
  }
  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("competition_id", competitionId)
    .in("id", teamIds);
  const valid = new Set((teams ?? []).map((t) => t.id));
  if (teamIds.some((id) => !valid.has(id))) {
    return { error: "A pool contains a pair that isn't in this competition." };
  }

  const { error: delErr } = await supabase
    .from("kotc_pools")
    .delete()
    .eq("stage_id", v.stageId);
  if (delErr) return { error: delErr.message };

  let pairCount = 0;
  for (let i = 0; i < v.pools.length; i++) {
    const { data: poolRow, error: pErr } = await supabase
      .from("kotc_pools")
      .insert({
        competition_id: competitionId,
        stage_id: v.stageId,
        name: v.pools[i].name,
        sort_order: i,
      })
      .select("id")
      .single();
    if (pErr || !poolRow) {
      return { error: pErr?.message ?? "Could not create pool." };
    }
    const pairRows = v.pools[i].teamIds.map((teamId, j) => ({
      competition_id: competitionId,
      pool_id: poolRow.id,
      team_id: teamId,
      entry_seed: j + 1,
      queue_position: j,
    }));
    const { error: ppErr } = await supabase
      .from("kotc_pool_pairs")
      .insert(pairRows);
    if (ppErr) return { error: ppErr.message };
    pairCount += pairRows.length;
  }

  revalidatePath("/orgs");
  return { poolCount: v.pools.length, pairCount };
}

/**
 * Record a pool's per-pair results manually (Phase 1 — no live rally log). Each
 * pair in the pool needs a King-points total (longest streak optional); the
 * reached-first tiebreaker stays inert until live play populates the event log.
 * Replaces any prior results and marks the pool completed.
 */
export async function submitKotcPoolResultsAction(
  values: SubmitKotcResultsInput,
): Promise<ActionError | { updated: number }> {
  const parsed = submitKotcResultsSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check the scores." };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: pool } = await supabase
    .from("kotc_pools")
    .select("id, competition_id")
    .eq("id", v.poolId)
    .single();
  if (!pool) return { error: "Pool not found." };

  const denied = await assertKotcAdmin(supabase, pool.competition_id as string);
  if (denied) return denied;

  const { data: pairs } = await supabase
    .from("kotc_pool_pairs")
    .select("team_id")
    .eq("pool_id", v.poolId);
  const poolTeams = new Set((pairs ?? []).map((p) => p.team_id));

  const resultTeams = v.results.map((r) => r.teamId);
  if (new Set(resultTeams).size !== resultTeams.length) {
    return { error: "A pair appears twice in the results." };
  }
  if (resultTeams.some((id) => !poolTeams.has(id))) {
    return { error: "A result references a pair that isn't in this pool." };
  }
  if (resultTeams.length !== poolTeams.size) {
    return { error: "Enter a result for every pair in the pool." };
  }

  const { error: delErr } = await supabase
    .from("kotc_pool_results")
    .delete()
    .eq("pool_id", v.poolId);
  if (delErr) return { error: delErr.message };

  const rows = v.results.map((r) => ({
    competition_id: pool.competition_id,
    pool_id: v.poolId,
    team_id: r.teamId,
    king_points: r.kingPoints,
    longest_streak: r.longestStreak ?? null,
  }));
  const { error: insErr } = await supabase
    .from("kotc_pool_results")
    .insert(rows);
  if (insErr) return { error: insErr.message };

  await supabase
    .from("kotc_pools")
    .update({ status: "completed" })
    .eq("id", v.poolId);

  revalidatePath("/orgs");
  return { updated: rows.length };
}

/**
 * Compute the overall seed from the seeding rounds. Ranks each pool by the pure
 * 3-level KotC tiebreaker (rankKotcPool), turns that into normalized placements,
 * and combines them via computeKotcSeeds; writes kotc_seeds.
 */
export async function computeKotcSeedsAction(
  competitionId: string,
): Promise<ActionError | { seedCount: number }> {
  const supabase = await createClient();
  const denied = await assertKotcAdmin(supabase, competitionId);
  if (denied) return denied;

  const { data: stages } = await supabase
    .from("kotc_stages")
    .select("id, ordinal")
    .eq("competition_id", competitionId)
    .eq("kind", "seeding")
    .order("ordinal");
  if (!stages || stages.length === 0) return { error: "No seeding rounds." };

  // One StagePlacement[] per seeding round (each pool ranked independently).
  const byStage: StagePlacement[][] = [];
  for (const stage of stages) {
    const { data: pools } = await supabase
      .from("kotc_pools")
      .select("id")
      .eq("stage_id", stage.id);
    const placements: StagePlacement[] = [];
    for (const pool of pools ?? []) {
      const { data: results } = await supabase
        .from("kotc_pool_results")
        .select("team_id, king_points, longest_streak, reached_final_seq")
        .eq("pool_id", pool.id);
      if (!results || results.length === 0) continue;
      const ranked = rankKotcPool(
        results.map((r) => ({
          teamId: r.team_id as string,
          kingPoints: r.king_points,
          longestStreak: r.longest_streak,
          reachedSeq: r.reached_final_seq,
        })),
      );
      ranked.forEach((row) =>
        placements.push({
          teamId: row.teamId,
          rank: row.position,
          poolSize: ranked.length,
          kingPoints: row.kingPoints,
        }),
      );
    }
    byStage.push(placements);
  }

  if (byStage.every((s) => s.length === 0)) {
    return { error: "Enter pool results before computing seeds." };
  }

  const seeds = computeKotcSeeds(byStage);

  const { error: delErr } = await supabase
    .from("kotc_seeds")
    .delete()
    .eq("competition_id", competitionId);
  if (delErr) return { error: delErr.message };

  const { error: insErr } = await supabase.from("kotc_seeds").insert(
    seeds.map((s) => ({
      competition_id: competitionId,
      team_id: s.teamId,
      seed_score: s.seedScore,
      total_points: s.totalPoints,
      seed_rank: s.seedRank,
    })),
  );
  if (insErr) return { error: insErr.message };

  revalidatePath("/orgs");
  return { seedCount: seeds.length };
}

/**
 * Propose a fair Round-2 re-pool from Round-1 results — balances pool strength
 * and minimizes rematches via the pure repoolForRound2. Returns a proposal (no
 * DB write); the organizer tweaks it, then commits with assignKotcPoolsAction.
 */
export async function repoolRound2Action(
  values: RepoolInput,
): Promise<ActionError | KotcPoolProposal> {
  const parsed = repoolSchema.safeParse(values);
  if (!parsed.success) return { error: "Invalid request." };
  const { competitionId, sizes } = parsed.data;

  const supabase = await createClient();
  const denied = await assertKotcAdmin(supabase, competitionId);
  if (denied) return denied;

  const { data: stages } = await supabase
    .from("kotc_stages")
    .select("id, ordinal")
    .eq("competition_id", competitionId)
    .eq("kind", "seeding")
    .order("ordinal");
  if (!stages || stages.length < 2) {
    return { error: "Re-pool needs at least two seeding rounds." };
  }
  const round1 = stages[0];
  const round2 = stages[1];

  const { data: pools } = await supabase
    .from("kotc_pools")
    .select("id")
    .eq("stage_id", round1.id);
  if (!pools || pools.length === 0) {
    return { error: "Assign and play Round 1 first." };
  }

  // Round-1 groupings (for rematch avoidance) + each pair's R1 placement score.
  const round1Pools: string[][] = [];
  const seedScore = new Map<string, number>();
  for (const pool of pools) {
    const { data: pairs } = await supabase
      .from("kotc_pool_pairs")
      .select("team_id")
      .eq("pool_id", pool.id);
    round1Pools.push((pairs ?? []).map((p) => p.team_id as string));

    const { data: results } = await supabase
      .from("kotc_pool_results")
      .select("team_id, king_points, longest_streak, reached_final_seq")
      .eq("pool_id", pool.id);
    if (!results || results.length === 0) {
      return { error: "Enter Round 1 results before re-pooling." };
    }
    const ranked = rankKotcPool(
      results.map((r) => ({
        teamId: r.team_id as string,
        kingPoints: r.king_points,
        longestStreak: r.longest_streak,
        reachedSeq: r.reached_final_seq,
      })),
    );
    ranked.forEach((row) =>
      seedScore.set(
        row.teamId,
        normalizedPlacement(row.position, ranked.length),
      ),
    );
  }

  const allTeams = round1Pools.flat();
  const targetSizes = sizes ?? round1Pools.map((p) => p.length);
  if (targetSizes.reduce((a, b) => a + b, 0) !== allTeams.length) {
    return { error: "Pool sizes must use every pair exactly once." };
  }

  const pairsInput: RepoolPair[] = allTeams.map((teamId) => ({
    teamId,
    seedScore: seedScore.get(teamId) ?? 0,
  }));
  const { pools: newPools, repeats } = repoolForRound2(
    pairsInput,
    round1Pools,
    targetSizes,
  );

  return {
    stageId: round2.id,
    pools: newPools.map((teamIds, i) => ({
      name: `Pool ${poolName(i)}`,
      teamIds,
    })),
    repeats,
  };
}
