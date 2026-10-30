"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";

import { updateRulesAction } from "@/server/actions/rules";
import { RULE_LIMITS, type RuleSection } from "@/lib/competition/rules";
import { rulesFormSchema, type RulesFormValues } from "@/lib/validations/rules";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RuleSectionFields } from "./rule-section-fields";

const BLANK: RuleSection = {
  title: "",
  houseRule: false,
  note: "",
  was: "",
  now: "",
  details: [],
  inShort: "",
};

/**
 * The organizer's side of the Rules tab (0188). Every rule is one card; the
 * whole list saves at once. What players see, and what the Help assistant
 * answers from, is exactly what is saved here.
 */
export function RulesEditor({
  competitionId,
  publicPath,
  initial,
}: {
  competitionId: string;
  /** The players' Rules tab, so the organizer can go and look. */
  publicPath: string;
  initial: RuleSection[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<RulesFormValues>({
    resolver: zodResolver(rulesFormSchema),
    defaultValues: { rules: initial },
  });
  const list = useFieldArray({ control: form.control, name: "rules" });

  const save = form.handleSubmit((values) =>
    start(async () => {
      const res = await updateRulesAction({
        competitionId,
        rules: values.rules,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Rules saved — players see them now.");
      form.reset(values);
      router.refresh();
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rules</CardTitle>
        <CardDescription>
          Players see these on the league&apos;s Rules tab, and the Help chat
          answers rule questions from them word for word. Fill in &ldquo;What it
          was&rdquo; for a rule you&apos;ve changed and it&apos;s listed under
          Rule updates. In any box, start a line with &ldquo;- &rdquo; for a
          bullet (two spaces first for a bullet under it) or &ldquo;1. &rdquo;
          for a numbered step.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-3">
          {list.fields.length === 0 && (
            <p className="text-muted-foreground border-border rounded-lg border border-dashed px-4 py-6 text-center text-sm">
              No rules yet. Add your league&apos;s first rule and the Rules tab
              appears for players.
            </p>
          )}
          {list.fields.map((f, i) => (
            <RuleSectionFields
              key={f.id}
              form={form}
              index={i}
              count={list.fields.length}
              onMove={(to) => list.move(i, to)}
              onRemove={() => list.remove(i)}
            />
          ))}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {list.fields.length < RULE_LIMITS.sections && (
              <Button
                type="button"
                variant="outline"
                onClick={() => list.append({ ...BLANK, details: [] })}
              >
                <Plus className="size-4" />
                Add a rule
              </Button>
            )}
            <Button type="submit" disabled={pending || !form.formState.isDirty}>
              {pending ? "Saving…" : "Save rules"}
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href={publicPath} target="_blank" rel="noreferrer">
                See it as players do
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
