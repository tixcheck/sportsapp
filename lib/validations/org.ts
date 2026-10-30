import { z } from "zod";

import { isSafeImageUrl } from "@/lib/uploads/image";

export const createOrgSchema = z.object({
  name: z.string().trim().min(2, "Organization name is too short.").max(80),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your name.").max(80),
  // http(s) only: a URL is all .url() checks, so `javascript:` and `data:`
  // passed (security audit, 2026-10-30). Same rule as org logos.
  avatarUrl: z
    .union([
      z
        .string()
        .trim()
        .refine(isSafeImageUrl, "Enter a full http:// or https:// image link."),
      z.literal(""),
    ])
    .optional(),
});

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
