"use client";

import type {
  AnswerMap,
  RegistrationQuestion,
} from "@/lib/queries/registration-questions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Renders an organizer's questions as a form.
 *
 * Follow-ups appear only once their parent has the answer that reveals them,
 * and they are indented under it — "if yes, at what level?" floating on its
 * own reads as a separate question about nothing.
 *
 * Controlled by the caller, because the two places this appears (a captain
 * mid-registration, a player alongside their waiver) both need to know whether
 * everything required has been filled in before they let the next thing
 * happen.
 */
export function QuestionFields({
  questions,
  values,
  onChange,
  disabled = false,
  suggested = {},
}: {
  questions: RegistrationQuestion[];
  values: AnswerMap;
  onChange: (questionId: string, value: string) => void;
  disabled?: boolean;
  /**
   * Values carried from another competition, not yet confirmed here. Flagged
   * on screen — a field that fills itself in silently is the one nobody
   * checks, and an address from last season may simply be wrong now.
   */
  suggested?: AnswerMap;
}) {
  const roots = questions.filter((q) => !q.parentQuestionId);
  const childrenOf = (id: string) =>
    questions.filter((q) => q.parentQuestionId === id);

  return (
    <div className="grid gap-4">
      {roots.map((q) => (
        <Field
          key={q.id}
          question={q}
          values={values}
          onChange={onChange}
          disabled={disabled}
          followUps={childrenOf(q.id)}
          suggested={suggested}
        />
      ))}
    </div>
  );
}

function Field({
  question: q,
  values,
  onChange,
  disabled,
  followUps,
  nested = false,
  suggested = {},
}: {
  question: RegistrationQuestion;
  values: AnswerMap;
  onChange: (questionId: string, value: string) => void;
  disabled: boolean;
  followUps: RegistrationQuestion[];
  nested?: boolean;
  suggested?: AnswerMap;
}) {
  const value = values[q.id] ?? "";
  const id = `q-${q.id}`;
  // Still showing what was carried over, and untouched since.
  const carried =
    suggested[q.id] !== undefined && suggested[q.id] === value && value !== "";

  return (
    <div className={cn("grid gap-1.5", nested && "border-rule border-l pl-4")}>
      <Label htmlFor={id}>
        {q.label}
        {!q.required && (
          <span className="text-muted-foreground ml-1.5 font-normal">
            (optional)
          </span>
        )}
      </Label>
      {q.helpText && (
        <p className="text-muted-foreground text-xs">{q.helpText}</p>
      )}
      {carried && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          From your last sign-up — check it&rsquo;s still right.
        </p>
      )}

      {q.kind === "long_text" ? (
        <textarea
          id={id}
          rows={3}
          maxLength={2000}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(q.id, e.target.value)}
          className="border-input bg-surface focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none"
        />
      ) : q.kind === "select" || q.kind === "yes_no" ? (
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(q.id, e.target.value)}
          className="border-input bg-surface h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Choose…</option>
          {(q.kind === "yes_no" ? ["Yes", "No"] : q.options).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={id}
          type={
            q.kind === "email" ? "email" : q.kind === "phone" ? "tel" : "text"
          }
          inputMode={
            q.kind === "email"
              ? "email"
              : q.kind === "phone"
                ? "tel"
                : undefined
          }
          maxLength={2000}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(q.id, e.target.value)}
        />
      )}

      {followUps
        .filter((f) => f.showWhen === value)
        .map((f) => (
          <div key={f.id} className="mt-2">
            <Field
              question={f}
              values={values}
              onChange={onChange}
              disabled={disabled}
              followUps={[]}
              nested
              suggested={suggested}
            />
          </div>
        ))}
    </div>
  );
}

/**
 * Which required questions are still blank, accounting for follow-ups that
 * aren't showing. Shared so the caller's "can we continue" test and the
 * database's `unanswered_player_questions` agree on what counts.
 */
export function missingRequired(
  questions: RegistrationQuestion[],
  values: AnswerMap,
): RegistrationQuestion[] {
  return questions.filter((q) => {
    if (!q.required) return false;
    if (q.parentQuestionId) {
      const parent = values[q.parentQuestionId] ?? "";
      if (parent !== q.showWhen) return false;
    }
    return (values[q.id] ?? "").trim() === "";
  });
}
