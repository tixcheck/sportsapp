"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { slugify, uniqueSlug } from "@/lib/utils/slug";
import { rankKotcPool, type KotcPoolResult } from "@/lib/kotc/ranking";
import {
  composeFinals,
  dropLowest,
  gatherConsolation,
} from "@/lib/kotc/elimination";
import {
  applyEvent,
  overallResults,
  reduceKotc,
  type KotcConfig,
  type KotcEvent,
} from "@/lib/kotc/engine";
import {
  computeKotcSeeds,
  evenPoolSizes,
  normalizedPlacement,
  seedElimination,
  type StagePlacement,
} from "@/lib/kotc/seed";
import { repoolForRound2, type RepoolPair } from "@/lib/kotc/repool";
import { poolName } from "@/lib/scheduler/pools";
import type { MatchFormat } from "@/lib/db/schema";
import {
  addKotcPairSchema,
  advanceEliminationRoundSchema,
  appendKotcRallySchema,
  assignKotcPoolsSchema,
  composeFinalsSchema,
  createKotcSchema,
  repoolSchema,
  runConsolationSchema,
  seedEliminationSchema,
  setKotcVisibilitySchema,
  submitKotcResultsSchema,
  updateKotcSettingsSchema,
  type AddKotcPairInput,
  type AdvanceEliminationRoundInput,
  type AppendKotcRallyInput,
  type AssignKotcPoolsInput,
  type ComposeFinalsInput,
  type CreateKotcInput,
  type RepoolInput,
  type RunConsolationInput,
  type SeedEliminationInput,
  type SetKotcVisibilityInput,
  type SubmitKotcResultsInput,
  type UpdateKotcSettingsInput,
} from "@/lib/validations/kotc";

/** The genuinely tied-lowest pairs (the bottom run sharing rank, tiebreakStep 4)
 * — what the organizer must choose between when a drop can't be auto-resolved. */
function tiedLowestTeamIds(results: KotcPoolResult[]): string[] {
  const ranked = rankKotcPool(results);
  let i = ranked.length - 1;
  const ids = [ranked[i].teamId];
  while (i > 0 && ranked[i].tiebreakStep === 4) {
    ids.unshift(ranked[i - 1].teamId);
    i -= 1;
  }
  return ids;
}

/** A reviewable pool proposal the UI tweaks, then commits via assignKotcPoolsAction. */
export interface KotcPoolProposal {
  stageId: string;
  pools: { name: string; teamIds: string[] }[];
  /** Residual repeat-poolmate count (re-pool only; 0 = no rematches). */
  repeats?: number;
}

const DEFAULT_TIMEZONE = "America/Toronto";

// The consolation round is ALWAYS a fixed 15 minutes — deliberately independent
// of the competition's configured round length (which drives elimination/finals).
const CONSOLATION_MINUTES = 15;

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

/** Advance the competition to in_progress once play begins (only from draft). */
async function markKotcInProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitionId: string,
): Promise<void> {
  await supabase
    .from("competitions")
    .update({ status: "in_progress" })
    .eq("id", competitionId)
    .eq("status", "draft");
}

/** Mark the competition completed (from any not-yet-completed status). */
async function markKotcCompleted(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitionId: string,
): Promise<void> {
  await supabase
    .from("competitions")
    .update({ status: "completed" })
    .eq("id", competitionId)
    .neq("status", "completed");
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
      location: v.location || null,
      notes: v.notes || null,
    })
    .eq("competition_id", competitionId);
  if (setErr) return { error: setErr.message };

  revalidatePath("/orgs");
  return { success: true };
}

/** Add a pair (a beach2 team) — team name + optional participant names. */
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
    .insert({
      competition_id: competitionId,
      name: parsed.data.name,
      players: parsed.data.players || null,
    })
    .select("id")
    .single();
  if (error || !team) return { error: error?.message ?? "Could not add pair." };

  revalidatePath("/orgs");
  return { teamId: team.id };
}

/**
 * Remove a pair (e.g. a no-show) so the schedule can be adjusted. Hard-deletes
 * the team; FKs cascade its pool membership, results and seed, and null its
 * rally-log references. Admin-gated; scoped to the competition.
 */
export async function removeKotcPairAction(
  competitionId: string,
  pairId: string,
): Promise<ActionError | { ok: true }> {
  if (!competitionId || !pairId) return { error: "Invalid request." };

  const supabase = await createClient();
  const denied = await assertKotcAdmin(supabase, competitionId);
  if (denied) return denied;

  const { error } = await supabase
    .from("teams")
    .delete()
    .eq("id", pairId)
    .eq("competition_id", competitionId);
  if (error) return { error: error.message };

  revalidatePath("/orgs");
  return { ok: true };
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
  await markKotcInProgress(supabase, pool.competition_id as string);

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

/**
 * Propose the elimination pools by serpentine-drafting the overall seed order
 * (pure seedElimination). Returns a reviewable proposal; the organizer tweaks it
 * then commits + locks via assignKotcPoolsAction + lockKotcStageAction.
 */
export async function seedEliminationAction(
  values: SeedEliminationInput,
): Promise<ActionError | KotcPoolProposal> {
  const parsed = seedEliminationSchema.safeParse(values);
  if (!parsed.success) return { error: "Invalid request." };
  const { competitionId, sizes } = parsed.data;

  const supabase = await createClient();
  const denied = await assertKotcAdmin(supabase, competitionId);
  if (denied) return denied;

  const { data: seeds } = await supabase
    .from("kotc_seeds")
    .select("team_id, seed_rank")
    .eq("competition_id", competitionId)
    .order("seed_rank");
  if (!seeds || seeds.length === 0) {
    return { error: "Compute the seed before drafting the elimination pools." };
  }
  const seedOrder = seeds.map((s) => s.team_id as string);

  const { data: stage } = await supabase
    .from("kotc_stages")
    .select("id")
    .eq("competition_id", competitionId)
    .eq("kind", "elimination")
    .order("ordinal")
    .limit(1)
    .single();
  if (!stage) return { error: "No elimination stage." };

  let targetSizes = sizes;
  if (!targetSizes) {
    const { data: settings } = await supabase
      .from("kotc_settings")
      .select("pairs_per_pool")
      .eq("competition_id", competitionId)
      .single();
    targetSizes = evenPoolSizes(
      seedOrder.length,
      settings?.pairs_per_pool ?? 5,
    );
  }
  if (targetSizes.reduce((a, b) => a + b, 0) !== seedOrder.length) {
    return { error: "Pool sizes must use every pair exactly once." };
  }

  const pools = seedElimination(seedOrder, targetSizes);
  return {
    stageId: stage.id,
    pools: pools.map((teamIds, i) => ({
      name: `Pool ${poolName(i)}`,
      teamIds,
    })),
  };
}

/** Lock a stage once its pools are set — marks it in_progress so play proceeds. */
export async function lockKotcStageAction(
  stageId: string,
): Promise<ActionError | { ok: true }> {
  const supabase = await createClient();
  const { data: stage } = await supabase
    .from("kotc_stages")
    .select("competition_id")
    .eq("id", stageId)
    .single();
  if (!stage) return { error: "Stage not found." };

  const denied = await assertKotcAdmin(
    supabase,
    stage.competition_id as string,
  );
  if (denied) return denied;

  const { error } = await supabase
    .from("kotc_stages")
    .update({ status: "in_progress" })
    .eq("id", stageId);
  if (error) return { error: error.message };

  revalidatePath("/orgs");
  return { ok: true };
}

/**
 * Record one drop-round of an elimination pool (and, identically, the finals
 * pool): write the round + its per-pair results, rank by the KotC tiebreaker,
 * drop the lowest, and report whether the pool is down to its final 3. A genuine
 * tie for last (manual entry only) is NOT auto-dropped — the action returns
 * `{ tie: true, tiedTeamIds }` and the organizer re-submits with `dropTeamId`.
 */
export async function advanceEliminationRoundAction(
  values: AdvanceEliminationRoundInput,
): Promise<
  | ActionError
  | { tie: true; tiedTeamIds: string[] }
  | { dropped: string; remaining: number; done: boolean }
> {
  const parsed = advanceEliminationRoundSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check the scores." };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: pool } = await supabase
    .from("kotc_pools")
    .select("id, competition_id, stage_id")
    .eq("id", v.poolId)
    .single();
  if (!pool) return { error: "Pool not found." };
  const competitionId = pool.competition_id as string;

  const denied = await assertKotcAdmin(supabase, competitionId);
  if (denied) return denied;

  // Current roster = pairs not yet eliminated from this pool.
  const { data: pairs } = await supabase
    .from("kotc_pool_pairs")
    .select("team_id")
    .eq("pool_id", v.poolId)
    .is("eliminated_at_round", null);
  const participants = new Set((pairs ?? []).map((p) => p.team_id as string));
  if (participants.size <= 3) {
    return { error: "This pool is already down to its final 3." };
  }
  const resultTeams = v.results.map((r) => r.teamId);
  if (new Set(resultTeams).size !== resultTeams.length) {
    return { error: "A pair appears twice in the results." };
  }
  if (
    resultTeams.length !== participants.size ||
    resultTeams.some((id) => !participants.has(id))
  ) {
    return { error: "Enter a result for exactly the pairs still in the pool." };
  }

  const roundResults: KotcPoolResult[] = v.results.map((r) => ({
    teamId: r.teamId,
    kingPoints: r.kingPoints,
    longestStreak: r.longestStreak ?? null,
    reachedSeq: null,
  }));
  const { dropped: autoDrop, tied } = dropLowest(roundResults);

  let drop: string;
  if (tied) {
    const tiedIds = tiedLowestTeamIds(roundResults);
    if (!v.dropTeamId) return { tie: true, tiedTeamIds: tiedIds };
    if (!tiedIds.includes(v.dropTeamId)) {
      return { error: "Pick one of the tied pairs to eliminate." };
    }
    drop = v.dropTeamId;
  } else {
    drop = autoDrop;
  }

  // The next round_index = how many rounds this pool has already played.
  const { data: existing } = await supabase
    .from("kotc_rounds")
    .select("id")
    .eq("pool_id", v.poolId);
  const roundIndex = existing?.length ?? 0;

  const { data: comp } = await supabase
    .from("kotc_settings")
    .select("round_minutes")
    .eq("competition_id", competitionId)
    .single();

  const { data: round, error: rErr } = await supabase
    .from("kotc_rounds")
    .insert({
      competition_id: competitionId,
      pool_id: v.poolId,
      round_index: roundIndex,
      minutes: comp?.round_minutes ?? 15,
      status: "completed",
    })
    .select("id")
    .single();
  if (rErr || !round) {
    return { error: rErr?.message ?? "Could not record the round." };
  }

  const { error: resErr } = await supabase.from("kotc_round_results").insert(
    v.results.map((r) => ({
      competition_id: competitionId,
      round_id: round.id,
      team_id: r.teamId,
      king_points: r.kingPoints,
      longest_streak: r.longestStreak ?? null,
    })),
  );
  if (resErr) return { error: resErr.message };

  const { error: dropErr } = await supabase
    .from("kotc_pool_pairs")
    .update({ eliminated_at_round: roundIndex })
    .eq("pool_id", v.poolId)
    .eq("team_id", drop);
  if (dropErr) return { error: dropErr.message };

  const remaining = participants.size - 1;
  const done = remaining <= 3;
  await markKotcInProgress(supabase, competitionId);
  if (done) {
    await supabase
      .from("kotc_pools")
      .update({ status: "completed" })
      .eq("id", v.poolId);
    // A finished finals pool = the competition has a podium → completed.
    const { data: st } = await supabase
      .from("kotc_stages")
      .select("kind")
      .eq("id", pool.stage_id as string)
      .single();
    if (st?.kind === "finals") await markKotcCompleted(supabase, competitionId);
  }

  revalidatePath("/orgs");
  return { dropped: drop, remaining, done };
}

/**
 * Run the single consolation round: gather every pair eliminated across the
 * elimination pools into one pool, record one round, and crown the highest-ranked
 * pair as the consolation winner (who earns the last finals berth). This round is
 * ALWAYS {@link CONSOLATION_MINUTES} (15) minutes — never the configured round
 * length. Idempotent: re-running replaces the consolation pool and its round.
 */
export async function runConsolationAction(
  values: RunConsolationInput,
): Promise<ActionError | { winner: string; played: number }> {
  const parsed = runConsolationSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check the scores." };
  const v = parsed.data;

  const supabase = await createClient();
  const denied = await assertKotcAdmin(supabase, v.competitionId);
  if (denied) return denied;

  // Pairs eliminated across every elimination pool = the consolation field.
  const { data: elimStages } = await supabase
    .from("kotc_stages")
    .select("id")
    .eq("competition_id", v.competitionId)
    .eq("kind", "elimination");
  const elimStageIds = (elimStages ?? []).map((s) => s.id as string);
  if (elimStageIds.length === 0) return { error: "No elimination stage." };

  const { data: elimPools } = await supabase
    .from("kotc_pools")
    .select("id")
    .in("stage_id", elimStageIds);
  const elimPoolIds = (elimPools ?? []).map((p) => p.id as string);
  if (elimPoolIds.length === 0) return { error: "No elimination pools yet." };

  const { data: dropped } = await supabase
    .from("kotc_pool_pairs")
    .select("pool_id, team_id")
    .in("pool_id", elimPoolIds)
    .not("eliminated_at_round", "is", null);
  const eliminated = gatherConsolation(
    elimPoolIds.map((id) => ({
      eliminated: (dropped ?? [])
        .filter((p) => p.pool_id === id)
        .map((p) => p.team_id as string),
    })),
  );
  if (eliminated.length < 2) {
    return {
      error: "Need at least 2 eliminated pairs for a consolation round.",
    };
  }

  // Results must cover exactly the eliminated field.
  const resultTeams = v.results.map((r) => r.teamId);
  if (new Set(resultTeams).size !== resultTeams.length) {
    return { error: "A pair appears twice in the results." };
  }
  const field = new Set(eliminated);
  if (
    resultTeams.length !== field.size ||
    resultTeams.some((id) => !field.has(id))
  ) {
    return { error: "Enter a result for exactly the eliminated pairs." };
  }

  // Lazily create the consolation stage (one per competition), then rebuild its
  // pool + round so re-runs are idempotent.
  let consolationStageId: string;
  const { data: existingStage } = await supabase
    .from("kotc_stages")
    .select("id")
    .eq("competition_id", v.competitionId)
    .eq("kind", "consolation")
    .maybeSingle();
  if (existingStage) {
    consolationStageId = existingStage.id as string;
  } else {
    const { data: maxRow } = await supabase
      .from("kotc_stages")
      .select("ordinal")
      .eq("competition_id", v.competitionId)
      .order("ordinal", { ascending: false })
      .limit(1)
      .single();
    const nextOrdinal = (maxRow?.ordinal ?? 0) + 1;
    const { data: created, error: stageErr } = await supabase
      .from("kotc_stages")
      .insert({
        competition_id: v.competitionId,
        ordinal: nextOrdinal,
        kind: "consolation",
        name: "Consolation",
        status: "completed",
      })
      .select("id")
      .single();
    if (stageErr || !created) {
      return { error: stageErr?.message ?? "Could not create the stage." };
    }
    consolationStageId = created.id as string;
  }

  // Cascades clear any prior consolation pool's pairs/rounds/results.
  await supabase.from("kotc_pools").delete().eq("stage_id", consolationStageId);

  const { data: pool, error: poolErr } = await supabase
    .from("kotc_pools")
    .insert({
      competition_id: v.competitionId,
      stage_id: consolationStageId,
      name: "Consolation",
      sort_order: 0,
      status: "completed",
    })
    .select("id")
    .single();
  if (poolErr || !pool) {
    return { error: poolErr?.message ?? "Could not create the pool." };
  }

  const { error: ppErr } = await supabase.from("kotc_pool_pairs").insert(
    eliminated.map((teamId, i) => ({
      competition_id: v.competitionId,
      pool_id: pool.id,
      team_id: teamId,
      entry_seed: i + 1,
      queue_position: i,
    })),
  );
  if (ppErr) return { error: ppErr.message };

  const { data: round, error: rErr } = await supabase
    .from("kotc_rounds")
    .insert({
      competition_id: v.competitionId,
      pool_id: pool.id,
      round_index: 0,
      minutes: CONSOLATION_MINUTES,
      status: "completed",
    })
    .select("id")
    .single();
  if (rErr || !round) {
    return { error: rErr?.message ?? "Could not record the round." };
  }

  const { error: resErr } = await supabase.from("kotc_round_results").insert(
    v.results.map((r) => ({
      competition_id: v.competitionId,
      round_id: round.id,
      team_id: r.teamId,
      king_points: r.kingPoints,
      longest_streak: r.longestStreak ?? null,
    })),
  );
  if (resErr) return { error: resErr.message };

  const ranked = rankKotcPool(
    v.results.map((r) => ({
      teamId: r.teamId,
      kingPoints: r.kingPoints,
      longestStreak: r.longestStreak ?? null,
      reachedSeq: null,
    })),
  );

  revalidatePath("/orgs");
  return { winner: ranked[0].teamId, played: eliminated.length };
}

/**
 * Assemble the finals: the 3 survivors of every elimination pool plus the
 * consolation winner, dropped into a fresh finals pool. Finals play then reuses
 * {@link advanceEliminationRoundAction} (the same drop-until-3 loop) on this pool
 * — the last 3 standing are the podium. Idempotent: rebuilds the finals pool.
 *
 * Consolation winner: 0 eliminated pairs → none; exactly 1 → that pair advances
 * directly (no round was playable); 2+ → requires {@link runConsolationAction}
 * to have crowned one first.
 */
export async function composeFinalsAction(
  values: ComposeFinalsInput,
): Promise<
  | ActionError
  | { stageId: string; poolId: string; roster: string[]; done: boolean }
> {
  const parsed = composeFinalsSchema.safeParse(values);
  if (!parsed.success) return { error: "Invalid request." };
  const { competitionId } = parsed.data;

  const supabase = await createClient();
  const denied = await assertKotcAdmin(supabase, competitionId);
  if (denied) return denied;

  const { data: elimStages } = await supabase
    .from("kotc_stages")
    .select("id")
    .eq("competition_id", competitionId)
    .eq("kind", "elimination");
  const elimStageIds = (elimStages ?? []).map((s) => s.id as string);
  if (elimStageIds.length === 0) return { error: "No elimination stage." };

  const { data: elimPools } = await supabase
    .from("kotc_pools")
    .select("id")
    .in("stage_id", elimStageIds)
    .order("sort_order");
  const elimPoolIds = (elimPools ?? []).map((p) => p.id as string);
  if (elimPoolIds.length === 0) return { error: "No elimination pools yet." };

  // Every elimination pool must be down to its final ≤3 before the finals form.
  const { data: allPairs } = await supabase
    .from("kotc_pool_pairs")
    .select("pool_id, team_id, entry_seed, eliminated_at_round")
    .in("pool_id", elimPoolIds)
    .order("entry_seed");
  const pairs = allPairs ?? [];

  const advancersPerPool: string[][] = [];
  for (const poolId of elimPoolIds) {
    const survivors = pairs
      .filter((p) => p.pool_id === poolId && p.eliminated_at_round === null)
      .map((p) => p.team_id as string);
    if (survivors.length > 3) {
      return { error: "Finish every elimination pool down to 3 first." };
    }
    advancersPerPool.push(survivors);
  }

  // Consolation winner — depends on how many pairs were eliminated overall.
  const eliminated = pairs
    .filter((p) => p.eliminated_at_round !== null)
    .map((p) => p.team_id as string);
  let consolationWinner: string | null = null;
  if (eliminated.length === 1) {
    consolationWinner = eliminated[0];
  } else if (eliminated.length >= 2) {
    const { data: consoStage } = await supabase
      .from("kotc_stages")
      .select("id")
      .eq("competition_id", competitionId)
      .eq("kind", "consolation")
      .maybeSingle();
    if (!consoStage) return { error: "Run the consolation round first." };

    const { data: consoPool } = await supabase
      .from("kotc_pools")
      .select("id")
      .eq("stage_id", consoStage.id)
      .maybeSingle();
    const { data: consoRound } = consoPool
      ? await supabase
          .from("kotc_rounds")
          .select("id")
          .eq("pool_id", consoPool.id)
          .maybeSingle()
      : { data: null };
    if (!consoRound) return { error: "Run the consolation round first." };

    const { data: consoResults } = await supabase
      .from("kotc_round_results")
      .select("team_id, king_points, longest_streak")
      .eq("round_id", consoRound.id);
    if (!consoResults || consoResults.length === 0) {
      return { error: "Run the consolation round first." };
    }
    const ranked = rankKotcPool(
      consoResults.map((r) => ({
        teamId: r.team_id as string,
        kingPoints: r.king_points as number,
        longestStreak: (r.longest_streak as number | null) ?? null,
        reachedSeq: null,
      })),
    );
    consolationWinner = ranked[0].teamId;
  }

  const roster = composeFinals(advancersPerPool, consolationWinner);
  if (roster.length === 0) return { error: "No finalists to seed." };

  // Lazily create the finals stage, then rebuild its pool so re-runs are idempotent.
  let finalsStageId: string;
  const { data: existingStage } = await supabase
    .from("kotc_stages")
    .select("id")
    .eq("competition_id", competitionId)
    .eq("kind", "finals")
    .maybeSingle();
  if (existingStage) {
    finalsStageId = existingStage.id as string;
  } else {
    const { data: maxRow } = await supabase
      .from("kotc_stages")
      .select("ordinal")
      .eq("competition_id", competitionId)
      .order("ordinal", { ascending: false })
      .limit(1)
      .single();
    const { data: created, error: stageErr } = await supabase
      .from("kotc_stages")
      .insert({
        competition_id: competitionId,
        ordinal: (maxRow?.ordinal ?? 0) + 1,
        kind: "finals",
        name: "Finals",
        status: "in_progress",
      })
      .select("id")
      .single();
    if (stageErr || !created) {
      return { error: stageErr?.message ?? "Could not create the stage." };
    }
    finalsStageId = created.id as string;
  }

  await supabase.from("kotc_pools").delete().eq("stage_id", finalsStageId);

  // A roster of 3 is already the podium — mark the pool completed; otherwise the
  // drop loop (advanceEliminationRoundAction) runs and completes it.
  const done = roster.length <= 3;
  const { data: pool, error: poolErr } = await supabase
    .from("kotc_pools")
    .insert({
      competition_id: competitionId,
      stage_id: finalsStageId,
      name: "Finals",
      sort_order: 0,
      status: done ? "completed" : "scheduled",
    })
    .select("id")
    .single();
  if (poolErr || !pool) {
    return { error: poolErr?.message ?? "Could not create the pool." };
  }

  const { error: ppErr } = await supabase.from("kotc_pool_pairs").insert(
    roster.map((teamId, i) => ({
      competition_id: competitionId,
      pool_id: pool.id,
      team_id: teamId,
      entry_seed: i + 1,
      queue_position: i,
    })),
  );
  if (ppErr) return { error: ppErr.message };

  // A 3-pair finals is the podium outright → competition complete.
  if (done) await markKotcCompleted(supabase, competitionId);

  revalidatePath("/orgs");
  return { stageId: finalsStageId, poolId: pool.id as string, roster, done };
}

// --- Live scoring (rally-by-rally) -------------------------------------------
// MVP scope: live scoring runs a seeding pool's KotC session — taps append to the
// append-only kotc_events log, and the derived per-pair summary is upserted into
// kotc_pool_results (so standings + the seed update live, and reached_final_seq
// activates the level-3 reached-first tiebreaker). Elimination/finals pools still
// use manual King-points entry.

/** Load a pool's roster + config + replayed event log for the pure engine. */
async function loadKotcPoolLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poolId: string,
): Promise<{
  competitionId: string;
  pairOrder: string[];
  config: KotcConfig;
  events: KotcEvent[];
  nextSeq: number;
} | null> {
  const { data: pool } = await supabase
    .from("kotc_pools")
    .select("id, competition_id")
    .eq("id", poolId)
    .single();
  if (!pool) return null;
  const competitionId = pool.competition_id as string;

  const { data: pairs } = await supabase
    .from("kotc_pool_pairs")
    .select("team_id, queue_position")
    .eq("pool_id", poolId)
    .order("queue_position", { ascending: true });
  const pairOrder = (pairs ?? []).map((p) => p.team_id as string);

  const { data: settings } = await supabase
    .from("kotc_settings")
    .select("rounds_per_session, point_cap")
    .eq("competition_id", competitionId)
    .single();
  const config: KotcConfig = {
    roundsPerSession: settings?.rounds_per_session ?? 3,
    pointCap: settings?.point_cap ?? null,
  };

  const { data: rows } = await supabase
    .from("kotc_events")
    .select("seq, type, point_awarded")
    .eq("pool_id", poolId)
    .order("seq", { ascending: true });
  const events: KotcEvent[] = [];
  let maxSeq = 0;
  for (const r of rows ?? []) {
    maxSeq = Math.max(maxSeq, r.seq as number);
    if (r.type === "rally") {
      events.push({
        type: "rally",
        winnerSide: r.point_awarded ? "king" : "challenger",
      });
    } else if (r.type === "round_end") {
      events.push({ type: "round_end" });
    } else if (r.type === "void") {
      events.push({ type: "void" });
    }
  }
  return { competitionId, pairOrder, config, events, nextSeq: maxSeq + 1 };
}

/** Recompute the pool's per-pair summary from a state and upsert kotc_pool_results. */
async function persistPoolResults(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitionId: string,
  poolId: string,
  results: ReturnType<typeof overallResults>,
): Promise<{ error: string } | null> {
  const { error } = await supabase.from("kotc_pool_results").upsert(
    results.map((r) => ({
      competition_id: competitionId,
      pool_id: poolId,
      team_id: r.teamId,
      king_points: r.kingPoints,
      longest_streak: r.longestStreak,
      reached_final_seq: r.reachedSeq,
    })),
    { onConflict: "pool_id,team_id" },
  );
  return error ? { error: error.message } : null;
}

/**
 * Record one rally tap. Replays the log to find the current King/challenger,
 * appends the rally, and re-derives the pool summary so standings update live.
 */
export async function appendKotcRallyAction(
  values: AppendKotcRallyInput,
): Promise<ActionError | { ok: true; done: boolean }> {
  const parsed = appendKotcRallySchema.safeParse(values);
  if (!parsed.success) return { error: "Invalid rally." };
  const { poolId, winnerSide } = parsed.data;

  const supabase = await createClient();
  const log = await loadKotcPoolLog(supabase, poolId);
  if (!log) return { error: "Pool not found." };
  if (log.pairOrder.length < 2) return { error: "This pool needs 2+ pairs." };

  const denied = await assertKotcAdmin(supabase, log.competitionId);
  if (denied) return denied;

  const state = reduceKotc(log.pairOrder, log.events, log.config);
  if (state.status === "complete") {
    return { error: "This session is already complete." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const king = state.kingTeamId;
  const challenger = state.challengerTeamId;

  const { error: insErr } = await supabase.from("kotc_events").insert({
    competition_id: log.competitionId,
    pool_id: poolId,
    seq: log.nextSeq,
    round_index: state.roundIndex,
    type: "rally",
    king_team_id: king,
    challenger_team_id: challenger,
    winner_team_id: winnerSide === "king" ? king : challenger,
    point_awarded: winnerSide === "king",
    created_by: user?.id ?? null,
  });
  if (insErr) return { error: insErr.message };

  const next = applyEvent(state, { type: "rally", winnerSide }, log.config);
  const persistErr = await persistPoolResults(
    supabase,
    log.competitionId,
    poolId,
    overallResults(next),
  );
  if (persistErr) return persistErr;
  await markKotcInProgress(supabase, log.competitionId);

  revalidatePath("/orgs");
  return { ok: true, done: next.status === "complete" };
}

/** Undo the most recent rally (append a void event, then re-derive results). */
export async function undoKotcRallyAction(
  poolId: string,
): Promise<ActionError | { ok: true }> {
  const supabase = await createClient();
  const log = await loadKotcPoolLog(supabase, poolId);
  if (!log) return { error: "Pool not found." };

  const denied = await assertKotcAdmin(supabase, log.competitionId);
  if (denied) return denied;

  if (!log.events.some((e) => e.type === "rally")) {
    return { error: "Nothing to undo." };
  }

  const state = reduceKotc(log.pairOrder, log.events, log.config);
  const { error: insErr } = await supabase.from("kotc_events").insert({
    competition_id: log.competitionId,
    pool_id: poolId,
    seq: log.nextSeq,
    round_index: state.roundIndex,
    type: "void",
  });
  if (insErr) return { error: insErr.message };

  const next = reduceKotc(
    log.pairOrder,
    [...log.events, { type: "void" }],
    log.config,
  );
  const persistErr = await persistPoolResults(
    supabase,
    log.competitionId,
    poolId,
    overallResults(next),
  );
  if (persistErr) return persistErr;

  revalidatePath("/orgs");
  return { ok: true };
}

/** End the current round — re-seeds the next round's lineup by this round's standings. */
export async function endKotcRoundAction(
  poolId: string,
): Promise<ActionError | { ok: true; done: boolean }> {
  const supabase = await createClient();
  const log = await loadKotcPoolLog(supabase, poolId);
  if (!log) return { error: "Pool not found." };

  const denied = await assertKotcAdmin(supabase, log.competitionId);
  if (denied) return denied;

  const state = reduceKotc(log.pairOrder, log.events, log.config);
  if (state.status === "complete")
    return { error: "Session already complete." };

  const { error: insErr } = await supabase.from("kotc_events").insert({
    competition_id: log.competitionId,
    pool_id: poolId,
    seq: log.nextSeq,
    round_index: state.roundIndex,
    type: "round_end",
  });
  if (insErr) return { error: insErr.message };

  const next = applyEvent(state, { type: "round_end" }, log.config);
  const persistErr = await persistPoolResults(
    supabase,
    log.competitionId,
    poolId,
    overallResults(next),
  );
  if (persistErr) return persistErr;

  revalidatePath("/orgs");
  return { ok: true, done: next.status === "complete" };
}

/**
 * Start (or read) the current round's 15-minute game clock by stamping a
 * round_start event. Idempotent — returns the existing start if already running.
 * round_start rows are timestamp markers only; the scoring engine ignores them.
 */
export async function startKotcRoundAction(
  poolId: string,
): Promise<ActionError | { startedAt: string; roundIndex: number }> {
  const supabase = await createClient();
  const log = await loadKotcPoolLog(supabase, poolId);
  if (!log) return { error: "Pool not found." };

  const denied = await assertKotcAdmin(supabase, log.competitionId);
  if (denied) return denied;

  const state = reduceKotc(log.pairOrder, log.events, log.config);
  if (state.status === "complete") return { error: "Session complete." };

  const { data: existing } = await supabase
    .from("kotc_events")
    .select("occurred_at")
    .eq("pool_id", poolId)
    .eq("type", "round_start")
    .eq("round_index", state.roundIndex)
    .maybeSingle();
  if (existing) {
    return {
      startedAt: existing.occurred_at as string,
      roundIndex: state.roundIndex,
    };
  }

  const { data: row, error } = await supabase
    .from("kotc_events")
    .insert({
      competition_id: log.competitionId,
      pool_id: poolId,
      seq: log.nextSeq,
      round_index: state.roundIndex,
      type: "round_start",
    })
    .select("occurred_at")
    .single();
  if (error || !row) {
    return { error: error?.message ?? "Could not start the round." };
  }

  revalidatePath("/orgs");
  return { startedAt: row.occurred_at as string, roundIndex: state.roundIndex };
}

/** Publish (public) or unpublish (private) the read-only spectator page. */
export async function setKotcVisibilityAction(
  values: SetKotcVisibilityInput,
): Promise<ActionError | { visibility: "public" | "private" }> {
  const parsed = setKotcVisibilitySchema.safeParse(values);
  if (!parsed.success) return { error: "Invalid request." };
  const { competitionId, isPublic } = parsed.data;

  const supabase = await createClient();
  const denied = await assertKotcAdmin(supabase, competitionId);
  if (denied) return denied;

  const visibility = isPublic ? "public" : "private";
  const { error } = await supabase
    .from("competitions")
    .update({ visibility })
    .eq("id", competitionId)
    .eq("type", "kotc");
  if (error) return { error: error.message };

  revalidatePath("/orgs");
  return { visibility };
}
