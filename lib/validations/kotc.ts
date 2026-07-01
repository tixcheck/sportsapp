import { z } from "zod";

const NAME = z.string().trim().min(2, "Name is too short.").max(100);
const PAIR_NAME = z.string().trim().min(2, "Name is too short.").max(80);

export const kotcSeedMetricEnum = z.enum([
  "normalized_placement",
  "raw_points",
]);

/** Create a KotC competition (beach 2s only in v0). */
export const createKotcSchema = z.object({
  name: NAME,
  venue: z.string().trim().max(120).optional().or(z.literal("")),
  pairsPerPool: z.number().int().min(2, "At least 2 pairs.").max(12),
  roundsPerSession: z.number().int().min(1).max(10),
  roundMinutes: z.number().int().min(1).max(120),
  // null = time-only rounds (no per-round point cap).
  pointCap: z.number().int().min(1).max(99).nullable(),
  seedingRoundCount: z
    .number()
    .int()
    .min(1, "At least 1 seeding round.")
    .max(5),
  seedMetric: kotcSeedMetricEnum,
});

/** Editable settings post-creation (seedingRoundCount is fixed — stages exist). */
export const updateKotcSettingsSchema = z.object({
  name: NAME,
  venue: z.string().trim().max(120).optional().or(z.literal("")),
  pairsPerPool: z.number().int().min(2).max(12),
  roundsPerSession: z.number().int().min(1).max(10),
  roundMinutes: z.number().int().min(1).max(120),
  pointCap: z.number().int().min(1).max(99).nullable(),
  seedMetric: kotcSeedMetricEnum,
});

export const addKotcPairSchema = z.object({
  // Team name (identity shown in standings/brackets).
  name: PAIR_NAME,
  // The two participants' first names, e.g. "Sam/Riley". Optional.
  players: z.string().trim().max(80).optional().or(z.literal("")),
});

/** Assign pairs into the pools of a stage (manual for Round 1; the reviewed
 * output of re-pool / elimination seeding for later stages). */
export const assignKotcPoolsSchema = z.object({
  stageId: z.string().min(1),
  pools: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        teamIds: z.array(z.string().min(1)).min(2, "A pool needs 2+ pairs."),
      }),
    )
    .min(1, "Add at least one pool."),
});

/** Manual per-pair results for a pool (Phase 1 — no live rally log). */
export const submitKotcResultsSchema = z.object({
  poolId: z.string().min(1),
  results: z
    .array(
      z.object({
        teamId: z.string().min(1),
        kingPoints: z.number().int().min(0).max(999),
        // optional — enables the longest-streak tiebreaker level under manual entry
        longestStreak: z.number().int().min(0).max(999).nullable().optional(),
      }),
    )
    .min(1),
});

/** Optional explicit pool sizes for re-pool / elimination (else derived). */
const sizesField = z.array(z.number().int().min(2)).min(1).optional();

export const repoolSchema = z.object({
  competitionId: z.string().min(1),
  sizes: sizesField,
});

export const seedEliminationSchema = z.object({
  competitionId: z.string().min(1),
  sizes: sizesField,
});

// --- Full elimination (iterative drop, consolation, finals) ------------------

/** A per-pair result for one elimination / consolation / finals round (manual). */
const kotcRoundResultItem = z.object({
  teamId: z.string().min(1),
  kingPoints: z.number().int().min(0).max(999),
  longestStreak: z.number().int().min(0).max(999).nullable().optional(),
});

/** Record one drop-round of an elimination pool (also the finals pool): the
 *  round's per-pair results, plus `dropTeamId` only to break a true tie. */
export const advanceEliminationRoundSchema = z.object({
  poolId: z.string().min(1),
  results: z.array(kotcRoundResultItem).min(4, "A drop-round needs 4+ pairs."),
  dropTeamId: z.string().min(1).optional(),
});

/** The single consolation round — results for all eliminated pairs. */
export const runConsolationSchema = z.object({
  competitionId: z.string().min(1),
  results: z.array(kotcRoundResultItem).min(2, "Consolation needs 2+ pairs."),
});

/** Assemble the finals roster (3-per-pool advancers + consolation winner). */
export const composeFinalsSchema = z.object({
  competitionId: z.string().min(1),
});

// --- Live scoring (rally-by-rally tap → kotc_events log) ----------------------

/** A single rally tap: which side won the point. */
export const appendKotcRallySchema = z.object({
  poolId: z.string().min(1),
  winnerSide: z.enum(["king", "challenger"]),
});

/** Publish (public) or unpublish (private) the spectator view. */
export const setKotcVisibilitySchema = z.object({
  competitionId: z.string().min(1),
  isPublic: z.boolean(),
});

export type CreateKotcInput = z.infer<typeof createKotcSchema>;
export type UpdateKotcSettingsInput = z.infer<typeof updateKotcSettingsSchema>;
export type AddKotcPairInput = z.infer<typeof addKotcPairSchema>;
export type AssignKotcPoolsInput = z.infer<typeof assignKotcPoolsSchema>;
export type SubmitKotcResultsInput = z.infer<typeof submitKotcResultsSchema>;
export type RepoolInput = z.infer<typeof repoolSchema>;
export type SeedEliminationInput = z.infer<typeof seedEliminationSchema>;
export type AdvanceEliminationRoundInput = z.infer<
  typeof advanceEliminationRoundSchema
>;
export type RunConsolationInput = z.infer<typeof runConsolationSchema>;
export type ComposeFinalsInput = z.infer<typeof composeFinalsSchema>;
export type AppendKotcRallyInput = z.infer<typeof appendKotcRallySchema>;
export type SetKotcVisibilityInput = z.infer<typeof setKotcVisibilitySchema>;
