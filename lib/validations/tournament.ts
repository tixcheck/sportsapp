import { z } from "zod";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const sportEnum = z.enum(["indoor6", "beach2", "coed4"]);

export const createTournamentSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short.").max(100),
    sport: sportEnum,
    startDate: z.string().regex(DATE_RE, "Pick a start date."),
    endDate: z.string().regex(DATE_RE, "Pick an end date."),
    // Daily event window ("HH:mm"), communicated to teams; start time also seeds
    // the first-match time when generating the schedule.
    startTime: z.string().regex(TIME_RE, "Pick a start time."),
    endTime: z.string().regex(TIME_RE, "Pick an end time."),
    venue: z.string().trim().max(120).optional().or(z.literal("")),
    courts: z.number().int().min(1, "At least 1 court.").max(40),
    // Target round-robin games each team plays in pool play; the pool structure
    // is sized to deliver ~this many (pool size ≈ games + 1).
    gamesPerTeam: z.number().int().min(1, "At least 1 game.").max(12),
    // Minutes to allow per game when spacing the schedule (null = estimate).
    minutesPerGame: z.number().int().min(5).max(120).nullable(),
    // Pool-play format preset; the bracket has its own (bracketFormatId).
    formatId: z.string().min(1),
    bracketFormatId: z.string().min(1),
    formatTemplate: z.enum(["single", "champ_consolation", "custom"]),
    // Pool play: true = a fixed 2-set game (ties allowed); false = the base
    // preset played as-is.
    twoSetRoundRobin: z.boolean(),
    // datetime-local string (interpreted in the tournament's timezone server-side)
    registrationDeadline: z.string().min(1, "Set a registration deadline."),
    divisions: z
      .array(
        z.object({ name: z.string().trim().min(1, "Name required.").max(40) }),
      )
      .min(1, "Add at least one division."),
    allowCaptainEntry: z.boolean(),
    allowRefEntry: z.boolean(),
    allowOrganizerEntry: z.boolean(),
    requireConfirmation: z.boolean(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "End date must be on or after the start date.",
    path: ["endDate"],
  })
  .refine((v) => v.startDate !== v.endDate || v.endTime > v.startTime, {
    message: "End time must be after the start time.",
    path: ["endTime"],
  });

/**
 * Editable tournament settings (post-creation). No sport (fundamental) or
 * divisions (teams are registered into them). Format/sets changes are blocked
 * server-side once scores exist; the rest stay editable.
 */
export const editTournamentSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short.").max(100),
    startDate: z.string().regex(DATE_RE, "Pick a start date."),
    endDate: z.string().regex(DATE_RE, "Pick an end date."),
    startTime: z.string().regex(TIME_RE, "Pick a start time."),
    endTime: z.string().regex(TIME_RE, "Pick an end time."),
    venue: z.string().trim().max(120).optional().or(z.literal("")),
    courts: z.number().int().min(1, "At least 1 court.").max(40),
    gamesPerTeam: z.number().int().min(1, "At least 1 game.").max(12),
    minutesPerGame: z.number().int().min(5).max(120).nullable(),
    formatId: z.string().min(1),
    bracketFormatId: z.string().min(1),
    formatTemplate: z.enum(["single", "champ_consolation", "custom"]),
    twoSetRoundRobin: z.boolean(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "End date must be on or after the start date.",
    path: ["endDate"],
  })
  .refine((v) => v.startDate !== v.endDate || v.endTime > v.startTime, {
    message: "End time must be after the start time.",
    path: ["endTime"],
  });

export const registerTeamSchema = z.object({
  teamName: z.string().trim().min(2, "Team name is too short.").max(80),
  divisionId: z.string().min(1, "Pick a division."),
  playerEmails: z
    .array(z.string().trim().email("Enter a valid email."))
    .min(1, "Add at least one player."),
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type EditTournamentInput = z.infer<typeof editTournamentSchema>;
export type RegisterTeamInput = z.infer<typeof registerTeamSchema>;
