import { z } from "zod";

/** "4, 6, 6, 6, 4" → [4, 6, 6, 6, 4]. */
export function parseTierSizes(text: string): number[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
}

export const seatTiersFormSchema = z.object({
  sizes: z
    .string()
    .regex(
      /^\s*\d+(\s*,\s*\d+)*\s*$/,
      "Tier sizes, top tier first: 4, 6, 6, 6, 4",
    )
    .refine(
      (s) => parseTierSizes(s).every((n) => n >= 2),
      "Every tier needs at least two teams.",
    ),
});

export type SeatTiersFormInput = z.infer<typeof seatTiersFormSchema>;
