import { z } from "zod";

/**
 * Ladder format settings (docs/plans/ladder-league.md).
 *
 * `swaps` is one count per BOUNDARY, top-down — index i trades between tier i
 * and tier i+1. There is no separate up/down setting on purpose: the exchange
 * is balanced by construction, which is what holds tier sizes steady all
 * season. A three-tier league therefore has exactly two swap counts.
 */
export const ladderUnitSchema = z.enum(["sets", "games"]);

export const ladderSettingsSchema = z.object({
  competitionId: z.string().uuid(),
  enabled: z.boolean(),
  unit: ladderUnitSchema,
  /** Sets (or games) EACH team gets per night. */
  target: z
    .number()
    .int("Whole numbers only.")
    .min(1, "Each team needs at least one.")
    .max(40, "That's more than a night can hold."),
  swaps: z
    .array(
      z
        .number()
        .int("Whole numbers only.")
        .min(0, "Can't be negative.")
        .max(20, "That's more teams than a tier holds."),
    )
    .max(19, "Too many tiers."),
});

export type LadderSettingsInput = z.infer<typeof ladderSettingsSchema>;
export type LadderUnit = z.infer<typeof ladderUnitSchema>;

/** Draw the next unplayed week's matchups for a ladder league. */
export const drawLadderWeekSchema = z.object({
  competitionId: z.string().uuid(),
});

/**
 * Lock a week: read its results, rank each tier, move teams, and write next
 * week's placements. `week` is explicit so a stale tab can't lock the wrong one.
 */
export const lockLadderWeekSchema = z.object({
  competitionId: z.string().uuid(),
  week: z.number().int().min(1),
});
