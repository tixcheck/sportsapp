"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

type ActionError = { error: string };

const KINDS = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "select",
  "yes_no",
  "address",
] as const;

const questionSchema = z
  .object({
    /** Absent on a question being created. */
    id: z.string().uuid().optional(),
    scope: z.enum(["team", "player"]),
    kind: z.enum(KINDS),
    label: z.string().trim().min(1, "Give the question a label.").max(200),
    helpText: z.string().trim().max(300).optional(),
    options: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    required: z.boolean().default(false),
    position: z.number().int().min(0).max(200),
    parentQuestionId: z.string().uuid().nullable().optional(),
    showWhen: z.string().trim().max(120).nullable().optional(),
  })
  .refine((q) => q.kind !== "select" || q.options.length >= 2, {
    message: "A choice question needs at least two options.",
    path: ["options"],
  })
  .refine(
    (q) =>
      (q.parentQuestionId == null && q.showWhen == null) ||
      (q.parentQuestionId != null && q.showWhen != null),
    {
      message: "A follow-up must say which answer reveals it.",
      path: ["showWhen"],
    },
  );

const saveSchema = z.object({
  competitionId: z.string().uuid(),
  questions: z.array(questionSchema).max(40),
});

/**
 * Replace a competition's questions with the list the organizer just edited.
 *
 * Delete-then-insert for anything removed, upsert for the rest. Deleting a
 * question takes its answers with it (`on delete cascade`), which is the right
 * behaviour and worth being deliberate about: an answer to a question nobody
 * can read is not data, it is a liability nobody knows they are holding.
 *
 * Follow-ups are written in a second pass because a new parent has no id until
 * its own insert returns.
 */
export async function saveRegistrationQuestionsAction(
  input: z.input<typeof saveSchema>,
): Promise<ActionError | { saved: number }> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the questions." };
  }
  const { competitionId, questions } = parsed.data;

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can change this." };
  }

  const { data: existing } = await supabase
    .from("registration_questions")
    .select("id")
    .eq("competition_id", competitionId);

  const keep = new Set(questions.map((q) => q.id).filter(Boolean) as string[]);
  const remove = (existing ?? [])
    .map((r) => r.id as string)
    .filter((id) => !keep.has(id));

  if (remove.length > 0) {
    const { error } = await supabase
      .from("registration_questions")
      .delete()
      .in("id", remove);
    if (error) {
      console.error("[questions] delete failed");
      return { error: "Couldn't remove those questions. Please try again." };
    }
  }

  // Parents first, so a follow-up added in the same save has something to
  // point at.
  const ordered = [...questions].sort((a, b) =>
    a.parentQuestionId ? (b.parentQuestionId ? 0 : 1) : -1,
  );

  for (const q of ordered) {
    const row = {
      ...(q.id ? { id: q.id } : {}),
      competition_id: competitionId,
      scope: q.scope,
      kind: q.kind,
      label: q.label,
      help_text: q.helpText || null,
      options: q.kind === "select" ? q.options : [],
      required: q.required,
      position: q.position,
      parent_question_id: q.parentQuestionId ?? null,
      show_when: q.showWhen ?? null,
    };
    const { error } = await supabase
      .from("registration_questions")
      .upsert(row, { onConflict: "id" });
    if (error) {
      console.error("[questions] upsert failed", error.message);
      return { error: "Couldn't save those questions. Please try again." };
    }
  }

  revalidatePath("/orgs");
  return { saved: questions.length };
}

const answersSchema = z.object({
  competitionId: z.string().uuid(),
  /** teamId for a team-scope save; omitted for a player answering for himself. */
  teamId: z.string().uuid().optional(),
  answers: z.record(z.string().uuid(), z.string().max(2000)),
});

/**
 * Save answers — the player's own, or a team's.
 *
 * The subject is decided HERE, never by the caller: a player-scope save is
 * always stamped with the signed-in user's id, so a crafted request cannot
 * write an answer against somebody else. RLS enforces the same rule again.
 *
 * Blank values delete rather than storing an empty string, so "answered with
 * nothing" and "not answered" don't become two states that behave the same but
 * count differently.
 */
export async function saveRegistrationAnswersAction(
  input: z.input<typeof answersSchema>,
): Promise<ActionError | { saved: number }> {
  const parsed = answersSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your answers." };
  }
  const { competitionId, teamId, answers } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  // Only questions belonging to this competition, and only of the scope being
  // saved — otherwise a team save could smuggle in a player answer.
  const { data: questions } = await supabase
    .from("registration_questions")
    .select("id, scope")
    .eq("competition_id", competitionId);
  const allowed = new Map(
    (questions ?? []).map((q) => [q.id as string, q.scope as string]),
  );
  const wantScope = teamId ? "team" : "player";

  const blanks: string[] = [];
  const rows: Record<string, unknown>[] = [];

  for (const [questionId, raw] of Object.entries(answers)) {
    if (allowed.get(questionId) !== wantScope) continue;
    const value = raw.trim();
    if (value === "") {
      blanks.push(questionId);
      continue;
    }
    rows.push({
      question_id: questionId,
      competition_id: competitionId,
      team_id: teamId ?? null,
      user_id: teamId ? null : user.id,
      value,
      updated_at: new Date().toISOString(),
    });
  }

  if (blanks.length > 0) {
    let del = supabase
      .from("registration_answers")
      .delete()
      .in("question_id", blanks);
    del = teamId ? del.eq("team_id", teamId) : del.eq("user_id", user.id);
    await del;
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("registration_answers").upsert(rows, {
      onConflict: teamId ? "question_id,team_id" : "question_id,user_id",
    });
    if (error) {
      console.error("[answers] upsert failed", error.message);
      return { error: "Couldn't save your answers. Please try again." };
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/orgs");
  return { saved: rows.length };
}
