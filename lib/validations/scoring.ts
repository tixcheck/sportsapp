import { z } from "zod";

export const scoringSettingsSchema = z.object({
  allowCaptainEntry: z.boolean(),
  allowRefEntry: z.boolean(),
  allowOrganizerEntry: z.boolean(),
  requireConfirmation: z.boolean(),
});

export type ScoringSettingsInput = z.infer<typeof scoringSettingsSchema>;
