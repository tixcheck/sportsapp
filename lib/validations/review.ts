import { z } from "zod";

export const reviewSchema = z.object({
  rating: z.number().int().min(1, "Pick a rating.").max(5, "Rating is 1 to 5."),
  comment: z
    .string()
    .trim()
    .min(3, "Add a few words.")
    .max(1000, "Keep it under 1000 characters."),
});

export type ReviewInput = z.infer<typeof reviewSchema>;
