"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";

import type {
  AnswerMap,
  RegistrationQuestion,
} from "@/lib/queries/registration-questions";
import { saveRegistrationAnswersAction } from "@/server/actions/registration-questions";
import {
  QuestionFields,
  missingRequired,
} from "@/components/registration/question-fields";
import { Button } from "@/components/ui/button";

/**
 * The details an organizer asks of every player, answered by that player.
 *
 * Sits above the waiver on the dashboard and must be completed first, which is
 * how the details get enforced without inventing a third reason a team can be
 * blocked: you can't sign until you've answered, and the team isn't scheduled
 * until everyone has signed. One gate, one explanation.
 *
 * The closing line is not decoration. Some of what an organizer asks for here
 * — an address, a phone number — is more than the name and email this platform
 * used to hold, and the person typing it should be told where it goes before
 * they type it, not afterwards in a policy.
 */
export function PlayerDetailsForm({
  competitionId,
  competitionName,
  organizerName,
  questions,
  initial,
  suggested = {},
  addressAutocomplete = false,
}: {
  competitionId: string;
  competitionName: string;
  organizerName: string;
  questions: RegistrationQuestion[];
  initial: AnswerMap;
  /** Carried from another competition of the same org, awaiting confirmation. */
  suggested?: AnswerMap;
  /** Whether a Places key is configured; false renders a plain input. */
  addressAutocomplete?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // A suggestion only fills a gap; anything answered here already wins.
  const [values, setValues] = useState<AnswerMap>({ ...suggested, ...initial });

  const missing = missingRequired(questions, values);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (missing.length > 0) {
      toast.error(`Still needed: ${missing.map((q) => q.label).join(", ")}`);
      return;
    }
    start(async () => {
      const res = await saveRegistrationAnswersAction({
        competitionId,
        answers: values,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Saved — thanks.");
      router.refresh();
    });
  }

  return (
    <section className="border-rule bg-surface rounded-xl border p-5">
      <p className="text-claret flex items-center gap-2 text-xs font-semibold tracking-[0.16em] uppercase">
        <ClipboardList className="size-4" />
        Before you play
      </p>

      <h2 className="mt-2 text-xl font-semibold tracking-tight">
        {organizerName} needs a few details
      </h2>
      <p className="text-ink-2 mt-1 text-sm">
        For {competitionName}. Your team isn&rsquo;t confirmed until everyone
        has filled these in and signed the waiver.
      </p>

      <form onSubmit={submit} className="mt-4 grid gap-4">
        <QuestionFields
          questions={questions}
          values={values}
          onChange={(id, v) => setValues((s) => ({ ...s, [id]: v }))}
          disabled={pending}
          suggested={suggested}
          addressAutocomplete={addressAutocomplete}
        />

        <Button type="submit" disabled={pending} className="justify-self-start">
          {pending ? "Saving…" : "Save my details"}
        </Button>
      </form>

      <p className="text-ink-3 mt-3 text-xs">
        These answers go to {organizerName} and to nobody else — not to your
        teammates, and not to other teams. You can change them later from this
        page.
      </p>
    </section>
  );
}
