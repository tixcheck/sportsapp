import { z } from "zod";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const sportEnum = z.enum(["indoor6", "beach2", "coed4"]);

export const createTournamentSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short.").max(100),
    sport: sportEnum,
    startDate: z.string().regex(DATE_RE, "Pick a start date."),
    endDate: z.string().regex(DATE_RE, "Pick an end date."),
    venue: z.string().trim().max(120).optional().or(z.literal("")),
    courts: z.number().int().min(1, "At least 1 court.").max(40),
    poolSize: z.number().int().min(2, "Pools need 2+ teams.").max(8),
    formatId: z.string().min(1),
    formatTemplate: z.enum(["single", "champ_consolation", "custom"]),
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
  });

export const registerTeamSchema = z.object({
  teamName: z.string().trim().min(2, "Team name is too short.").max(80),
  divisionId: z.string().min(1, "Pick a division."),
  playerEmails: z
    .array(z.string().trim().email("Enter a valid email."))
    .min(1, "Add at least one player."),
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type RegisterTeamInput = z.infer<typeof registerTeamSchema>;
