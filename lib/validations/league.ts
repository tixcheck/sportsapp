import { z } from "zod";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const sportEnum = z.enum(["indoor6", "beach2", "coed4"]);

export const createLeagueSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short.").max(100),
    sport: sportEnum,
    startDate: z.string().regex(DATE_RE, "Pick a start date."),
    endDate: z.string().regex(DATE_RE, "Pick an end date."),
    venue: z.string().trim().max(120).optional().or(z.literal("")),
    courts: z.number().int().min(1, "At least 1 court.").max(20),
    // Note: avoid `n === 1 || n === 2` — TS reads that as a type guard, which
    // makes Zod narrow the output to `1 | 2` and diverge from the input type.
    roundsPerTeam: z
      .number()
      .int()
      .refine((n) => [1, 2].includes(n), {
        message: "Choose 1× or 2×.",
      }),
    // Cap each team at this many games (partial round robin). Null = full RR.
    gamesPerTeam: z.number().int().min(1).max(60).nullable(),
    // Standings tiebreaker hierarchy (see RankMode). Default OVA ratios.
    // Games each team plays per week (default 1). 2 = two games a night.
    gamesPerWeek: z.number().int().min(1).max(7),
    // Minutes each game occupies (spacing + rest gaps). Default 45.
    minutesPerGame: z.number().int().min(15).max(180),
    tiebreaker: z.enum(["ova", "differential"]),
    // The league's specific courts + which are "prime" (better conditions,
    // balanced evenly across teams). Null/empty = plain 1…N court numbering.
    courtList: z
      .array(
        z.object({
          label: z.string().trim().min(1, "Court label required.").max(12),
          prime: z.boolean(),
        }),
      )
      .max(40)
      .nullable(),
    // Single weekly slot in v0 (DESIGN/scope decision).
    slotDayOfWeek: z.number().int().min(0).max(6),
    slotStartTime: z.string().regex(TIME_RE, "Use HH:mm."),
    formatId: z.string().min(1),
    // true = round-robin games are a fixed 2-set game (ties allowed); false = bo3.
    twoSetRoundRobin: z.boolean(),
    blackoutDates: z.array(z.string().regex(DATE_RE)),
    allowCaptainEntry: z.boolean(),
    allowRefEntry: z.boolean(),
    allowOrganizerEntry: z.boolean(),
    requireConfirmation: z.boolean(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "End date must be on or after the start date.",
    path: ["endDate"],
  });

/**
 * Editable league settings (post-creation). No sport (fundamental). Format/sets
 * changes are blocked server-side once scores exist; the rest stay editable and
 * take effect when the schedule is regenerated.
 */
export const editLeagueSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short.").max(100),
    startDate: z.string().regex(DATE_RE, "Pick a start date."),
    endDate: z.string().regex(DATE_RE, "Pick an end date."),
    venue: z.string().trim().max(120).optional().or(z.literal("")),
    courts: z.number().int().min(1, "At least 1 court.").max(20),
    roundsPerTeam: z
      .number()
      .int()
      .refine((n) => [1, 2].includes(n), { message: "Choose 1× or 2×." }),
    gamesPerTeam: z.number().int().min(1).max(60).nullable(),
    // Games each team plays per week (default 1). 2 = two games a night.
    gamesPerWeek: z.number().int().min(1).max(7),
    // Minutes each game occupies (spacing + rest gaps). Default 45.
    minutesPerGame: z.number().int().min(15).max(180),
    tiebreaker: z.enum(["ova", "differential"]),
    // The league's specific courts + which are "prime" (better conditions,
    // balanced evenly across teams). Null/empty = plain 1…N court numbering.
    courtList: z
      .array(
        z.object({
          label: z.string().trim().min(1, "Court label required.").max(12),
          prime: z.boolean(),
        }),
      )
      .max(40)
      .nullable(),
    slotDayOfWeek: z.number().int().min(0).max(6),
    slotStartTime: z.string().regex(TIME_RE, "Use HH:mm."),
    formatId: z.string().min(1),
    twoSetRoundRobin: z.boolean(),
    blackoutDates: z.array(z.string().regex(DATE_RE)),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "End date must be on or after the start date.",
    path: ["endDate"],
  });

export const addTeamSchema = z.object({
  name: z.string().trim().min(2, "Team name is too short.").max(80),
  captainEmail: z.string().trim().email("Enter a valid email."),
  // Optional second partner (beach 2s): added to the roster so both see the
  // schedule and can enter scores, not just the captain.
  partnerEmail: z
    .union([z.string().trim().email("Enter a valid email."), z.literal("")])
    .optional(),
});

/**
 * Pushing a season back by whole weeks. Capped at 8: past that an organizer
 * is really rescheduling the season, not absorbing a cancellation.
 */
export const shiftScheduleSchema = z.object({
  competitionId: z.string().uuid(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date."),
  weeks: z.number().int().min(1, "Push by at least one week.").max(8),
  reason: z.string().trim().max(200).optional(),
});

/**
 * Adding teams to a league already in progress. Mode A gives the new pairs as
 * many games as the remaining weeks allow; mode B tops them up to the target
 * with catch-up games among themselves.
 */
export const addTeamsMidSeasonSchema = z.object({
  competitionId: z.string().uuid(),
  mode: z.enum(["A", "B"]),
});

export type AddTeamsMidSeasonInput = z.infer<typeof addTeamsMidSeasonSchema>;
export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;
export type EditLeagueInput = z.infer<typeof editLeagueSchema>;
export type AddTeamInput = z.infer<typeof addTeamSchema>;
export type ShiftScheduleInput = z.infer<typeof shiftScheduleSchema>;

export const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
