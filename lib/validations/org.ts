import { z } from "zod";

export const createOrgSchema = z.object({
  name: z.string().trim().min(2, "Organization name is too short.").max(80),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your name.").max(80),
  avatarUrl: z
    .union([z.string().trim().url("Enter a valid image URL."), z.literal("")])
    .optional(),
});

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
