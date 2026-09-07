"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type {
  QuestionKind,
  QuestionScope,
  RegistrationQuestion,
} from "@/lib/queries/registration-questions";
import { saveRegistrationQuestionsAction } from "@/server/actions/registration-questions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Draft = Omit<RegistrationQuestion, "id"> & { id?: string; key: string };

const KIND_LABEL: Record<QuestionKind, string> = {
  short_text: "Short text",
  long_text: "Long text",
  email: "Email",
  phone: "Phone",
  select: "Choose one",
  yes_no: "Yes / No",
  address: "Address",
};

let counter = 0;
const nextKey = () => `new-${counter++}`;

/**
 * A common starting point, offered rather than imposed.
 *
 * Ten fields typed by hand is where an organizer gives up and emails a
 * spreadsheet instead — which is the thing this feature exists to replace. It
 * loads as editable drafts, so the first thing anyone does is delete the two
 * they don't want.
 */
const STARTER: Omit<Draft, "key">[] = [
  {
    scope: "player",
    kind: "short_text",
    label: "First name",
    helpText: null,
    options: [],
    required: true,
    position: 0,
    parentQuestionId: null,
    showWhen: null,
  },
  {
    scope: "player",
    kind: "short_text",
    label: "Last name",
    helpText: null,
    options: [],
    required: true,
    position: 1,
    parentQuestionId: null,
    showWhen: null,
  },
  {
    scope: "player",
    kind: "select",
    label: "Gender",
    helpText: null,
    options: ["Man", "Woman", "Non-binary", "Prefer not to say"],
    required: false,
    position: 2,
    parentQuestionId: null,
    showWhen: null,
  },
  {
    scope: "player",
    kind: "select",
    label: "Skill level",
    helpText: null,
    options: ["Rec", "Rec Intermediate", "Intermediate", "Competitive"],
    required: true,
    position: 3,
    parentQuestionId: null,
    showWhen: null,
  },
  {
    scope: "player",
    kind: "phone",
    label: "Phone number",
    helpText: null,
    options: [],
    required: true,
    position: 4,
    parentQuestionId: null,
    showWhen: null,
  },
  {
    scope: "player",
    kind: "address",
    label: "Full address",
    helpText: "Street, city, province and postal code.",
    options: [],
    required: true,
    position: 5,
    parentQuestionId: null,
    showWhen: null,
  },
  {
    scope: "player",
    kind: "yes_no",
    label: "Have you played in this league before?",
    helpText: null,
    options: [],
    required: true,
    position: 6,
    parentQuestionId: null,
    showWhen: null,
  },
  {
    scope: "team",
    kind: "select",
    label: "Compared with your last season, this team is",
    helpText: null,
    options: ["Stronger", "About the same", "Weaker", "We're new"],
    required: false,
    position: 0,
    parentQuestionId: null,
    showWhen: null,
  },
];

/**
 * Define what a competition asks at registration.
 *
 * Two scopes shown separately because organizers reason about them separately:
 * a captain answers the team questions once, every player answers their own.
 * The card says which is which in plain words, since getting it wrong means
 * asking six people the same question about their team.
 */
export function RegistrationQuestionsCard({
  competitionId,
  initial,
}: {
  competitionId: string;
  initial: RegistrationQuestion[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    initial.map((q) => ({ ...q, key: q.id })),
  );

  const set = (key: string, patch: Partial<Draft>) =>
    setDrafts((d) => d.map((q) => (q.key === key ? { ...q, ...patch } : q)));

  function add(scope: QuestionScope) {
    setDrafts((d) => [
      ...d,
      {
        key: nextKey(),
        scope,
        kind: "short_text",
        label: "",
        helpText: null,
        options: [],
        required: false,
        position: d.filter((q) => q.scope === scope).length,
        parentQuestionId: null,
        showWhen: null,
      },
    ]);
  }

  function save() {
    const blank = drafts.find((q) => q.label.trim() === "");
    if (blank) {
      toast.error("Every question needs a label.");
      return;
    }
    start(async () => {
      const res = await saveRegistrationQuestionsAction({
        competitionId,
        questions: drafts.map((q, i) => ({
          ...(q.id ? { id: q.id } : {}),
          scope: q.scope,
          kind: q.kind,
          label: q.label.trim(),
          helpText: q.helpText ?? undefined,
          options: q.options,
          required: q.required,
          position: i,
          parentQuestionId: q.parentQuestionId,
          showWhen: q.showWhen,
        })),
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Registration questions saved.");
      router.refresh();
    });
  }

  const rows = (scope: QuestionScope) =>
    drafts.filter((q) => q.scope === scope);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registration questions</CardTitle>
        <CardDescription>
          Anything you need beyond a name and email. Team questions are answered
          once by the captain; player questions are answered by each player
          themselves, alongside the waiver.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {drafts.length === 0 && (
          <div className="border-rule rounded-lg border border-dashed p-4 text-center">
            <p className="text-muted-foreground text-sm">
              No questions yet — registration asks only for a team name and
              emails.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() =>
                setDrafts(STARTER.map((q) => ({ ...q, key: nextKey() })))
              }
            >
              Start from a common set
            </Button>
          </div>
        )}

        {(["player", "team"] as const).map((scope) => (
          <div key={scope} className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {scope === "player"
                  ? "Asked of every player"
                  : "Asked once, of the captain"}
              </p>
              <Button variant="outline" size="sm" onClick={() => add(scope)}>
                <Plus className="size-4" />
                Add
              </Button>
            </div>

            {rows(scope).length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing yet.</p>
            ) : (
              <ul className="space-y-2">
                {rows(scope).map((q) => (
                  <li
                    key={q.key}
                    className="border-rule bg-surface grid gap-2 rounded-lg border p-3"
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="text-muted-foreground mt-2 size-4 shrink-0" />
                      <Input
                        value={q.label}
                        placeholder="Question"
                        onChange={(e) => set(q.key, { label: e.target.value })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${q.label || "question"}`}
                        onClick={() =>
                          setDrafts((d) => d.filter((x) => x.key !== q.key))
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pl-6">
                      <select
                        value={q.kind}
                        onChange={(e) =>
                          set(q.key, { kind: e.target.value as QuestionKind })
                        }
                        className="border-input bg-surface h-8 rounded-md border px-2 text-xs"
                      >
                        {Object.entries(KIND_LABEL).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>

                      <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={q.required}
                          onChange={(e) =>
                            set(q.key, { required: e.target.checked })
                          }
                        />
                        Required
                      </label>

                      {q.kind === "select" && (
                        <Input
                          className="h-8 flex-1 text-xs"
                          placeholder="Options, comma separated"
                          value={q.options.join(", ")}
                          onChange={(e) =>
                            set(q.key, {
                              options: e.target.value
                                .split(",")
                                .map((o) => o.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {drafts.some((q) => q.required) && (
          <p className="text-muted-foreground text-xs">
            Required player questions must be answered before that player can
            sign the waiver — so the team isn&apos;t scheduled until everyone
            has done both.
          </p>
        )}

        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save questions"}
        </Button>
      </CardContent>
    </Card>
  );
}
