import type {
  AnswerMap,
  RegistrationQuestion,
} from "@/lib/queries/registration-questions";

/**
 * Which required questions are still blank, accounting for follow-ups that
 * aren't showing.
 *
 * Lives in `lib/` rather than beside the form because it is the CLIENT half of
 * a rule the database enforces too: `unanswered_player_questions` (migration
 * 0104) decides the same thing server-side, and the two have to agree. A form
 * that lets somebody through on a question the database will refuse is a dead
 * end at the last step — they fill everything in, press the button, and are
 * told no by a sentence that names nothing. A form that blocks a question the
 * database would have allowed is a sign-up nobody can finish at all.
 *
 * Type-only imports above, so a "use client" form can import this without
 * pulling in the server-only query module.
 *
 * Pure: no DB.
 */
export function missingRequired(
  questions: RegistrationQuestion[],
  values: AnswerMap,
): RegistrationQuestion[] {
  return questions.filter((q) => {
    if (!q.required) return false;
    // A follow-up only counts once its parent carries the answer that reveals
    // it — "if yes, at what level?" is not owed by somebody who said no.
    if (q.parentQuestionId) {
      const parent = values[q.parentQuestionId] ?? "";
      if (parent !== q.showWhen) return false;
    }
    // Whitespace is not an answer. The database agrees: its check is
    // `btrim(a.value) <> ''`.
    return (values[q.id] ?? "").trim() === "";
  });
}
