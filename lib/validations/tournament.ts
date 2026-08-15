import { z } from "zod";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const sportEnum = z.enum(["indoor6", "beach2", "coed4", "softball"]);

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
    // Registration capacity. Null = uncapped; the field is left blank to mean
    // "as many as sign up", which is how every event worked before this.
    maxTeams: z
      .number()
      .int()
      .min(2, "A capped event needs room for at least 2 teams.")
      .max(512)
      .nullable(),
    // Target round-robin games each team plays in pool play; the pool structure
    // is sized to deliver ~this many (pool size ≈ games + 1).
    gamesPerTeam: z.number().int().min(1, "At least 1 game.").max(12),
    // Minutes to allow per game when spacing the schedule (null = estimate).
    minutesPerGame: z.number().int().min(5).max(120).nullable(),
    // Pool-play format preset; the bracket has its own (bracketFormatId).
    formatId: z.string().min(1),
    bracketFormatId: z.string().min(1),
    formatTemplate: z.enum(["single", "champ_consolation", "custom"]),
    // How many pool finishers advance to the playoff bracket (null = decide
    // later). Drives the generic bracket preview on the public page.
    playoffTeams: z.number().int().min(2).max(64).nullable(),
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
    // Registration fee, set at creation rather than hunted for afterwards.
    // Dollars here because that is what the organizer types; the action
    // converts to cents at the trust boundary. Zero = a free event.
    feeDollars: z
      .number()
      .min(0, "A fee can't be negative.")
      .max(9_999, "That's higher than any real registration fee.")
      .multipleOf(0.01, "Fees are in whole cents."),
    allowCaptainPays: z.boolean(),
    allowSplitPayment: z.boolean(),
    taxEnabled: z.boolean(),
    taxPercent: z.number().min(0).max(100),
    paymentRequired: z.boolean(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "End date must be on or after the start date.",
    path: ["endDate"],
  })
  .refine((v) => v.startDate !== v.endDate || v.endTime > v.startTime, {
    message: "End time must be after the start time.",
    path: ["endTime"],
  })
  // Mirrors the DB check constraint: a priced event nobody can pay for is a
  // dead end, so at least one mode must be open whenever there is a fee.
  .refine(
    (v) => v.feeDollars === 0 || v.allowCaptainPays || v.allowSplitPayment,
    {
      message: "Pick at least one way for teams to pay.",
      path: ["allowCaptainPays"],
    },
  );

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
    // Registration capacity. Null = uncapped; the field is left blank to mean
    // "as many as sign up", which is how every event worked before this.
    maxTeams: z
      .number()
      .int()
      .min(2, "A capped event needs room for at least 2 teams.")
      .max(512)
      .nullable(),
    gamesPerTeam: z.number().int().min(1, "At least 1 game.").max(12),
    minutesPerGame: z.number().int().min(5).max(120).nullable(),
    formatId: z.string().min(1),
    bracketFormatId: z.string().min(1),
    formatTemplate: z.enum(["single", "champ_consolation", "custom"]),
    playoffTeams: z.number().int().min(2).max(64).nullable(),
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

/**
 * Multi-day plan + per-division courts (organizer setup). Fewer than 2 days is
 * treated as a single-day event server-side. Courts null = the division shares
 * the whole pool.
 */
export const multiDayConfigSchema = z.object({
  days: z
    .array(
      z.object({
        date: z.string().regex(DATE_RE, "Pick a date."),
        startTime: z.string().regex(TIME_RE, "Pick a start time."),
        endTime: z.string().regex(TIME_RE, "Pick an end time."),
        targetGamesPerTeam: z.number().int().min(0).max(20),
      }),
    )
    .max(14),
  divisionCourts: z.array(
    z.object({
      divisionId: z.string().min(1),
      courts: z.array(z.number().int().min(1).max(40)).nullable(),
    }),
  ),
});

// One roster entry: an email (the login key — required to actually stored) and
// an optional readable name. Empty email = a blank row the form filters out.
export const registerPlayerSchema = z.object({
  name: z.string().trim().max(80).optional(),
  email: z.union([
    z.string().trim().email("Enter a valid email."),
    z.literal(""),
  ]),
});

export const registerTeamSchema = z.object({
  teamName: z.string().trim().min(2, "Team name is too short.").max(80),
  // How the captain intends to settle a fee. Ignored for free events and for
  // events that don't require payment; the DB records it on the team so the
  // team page knows which flow to offer before any charge exists.
  paymentMode: z.enum(["team_full", "player_share"]),
  // Empty string = no division/tier (single-division tournament, or an untiered
  // league). The register_team RPC validates any non-empty id belongs here.
  divisionId: z.string(),
  players: z
    .array(registerPlayerSchema)
    .min(1, "Add at least one player.")
    .refine((ps) => ps.some((p) => p.email && p.email.length > 0), {
      message: "Add at least one player email.",
    }),
});

export type RegisterPlayerInput = z.infer<typeof registerPlayerSchema>;

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type EditTournamentInput = z.infer<typeof editTournamentSchema>;
export type MultiDayConfigInput = z.infer<typeof multiDayConfigSchema>;
export type RegisterTeamInput = z.infer<typeof registerTeamSchema>;
