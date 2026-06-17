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
    // Single weekly slot in v0 (DESIGN/scope decision).
    slotDayOfWeek: z.number().int().min(0).max(6),
    slotStartTime: z.string().regex(TIME_RE, "Use HH:mm."),
    formatId: z.string().min(1),
    blackoutDates: z.array(z.string().regex(DATE_RE)),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "End date must be on or after the start date.",
    path: ["endDate"],
  });

export const addTeamSchema = z.object({
  name: z.string().trim().min(2, "Team name is too short.").max(80),
  captainEmail: z.string().trim().email("Enter a valid email."),
});

export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;
export type AddTeamInput = z.infer<typeof addTeamSchema>;

export const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
