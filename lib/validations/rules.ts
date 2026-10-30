import { z } from "zod";

import { RULE_LIMITS } from "@/lib/competition/rules";

const L = RULE_LIMITS;
const text = (max: number, what: string) =>
  z
    .string()
    .trim()
    .max(max, `${what} is too long — keep it under ${max} characters.`);

/** One rule as the editor submits it (0188). */
export const ruleSectionSchema = z.object({
  title: text(L.title, "A title").min(1, "Every rule needs a title."),
  houseRule: z.boolean(),
  note: text(L.inShort, "The note"),
  was: text(L.text, "“What it was”"),
  now: text(L.text, "“What it is now”"),
  details: z
    .array(
      z.object({
        label: text(L.label, "A row label"),
        text: text(L.text, "A row"),
      }),
    )
    .max(L.details, `Up to ${L.details} extra rows per rule.`),
  inShort: text(L.inShort, "“In short”"),
});

export const rulesFormSchema = z.object({
  rules: z
    .array(ruleSectionSchema)
    .max(L.sections, `Up to ${L.sections} rules.`),
});

export type RulesFormValues = z.infer<typeof rulesFormSchema>;
