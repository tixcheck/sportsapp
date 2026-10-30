"use client";

import { useState } from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";

import type { RulesFormValues } from "@/lib/validations/rules";
import { RULE_LIMITS } from "@/lib/competition/rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const AREA =
  "border-border bg-surface w-full rounded-md border px-3 py-2 text-sm leading-relaxed";

/** One rule in the editor: its parts, its extra rows, and its place in the list. */
export function RuleSectionFields({
  form,
  index,
  count,
  onMove,
  onRemove,
}: {
  form: UseFormReturn<RulesFormValues>;
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const { register, watch, formState } = form;
  const details = useFieldArray({
    control: form.control,
    name: `rules.${index}.details`,
  });
  const err = formState.errors.rules?.[index];
  const title = watch(`rules.${index}.title`);
  const was = watch(`rules.${index}.was`);
  const id = (f: string) => `rule-${index}-${f}`;
  // Open on arrival only for a new rule. Read once: tying `open` to the live
  // title would snap the card shut on the first letter typed.
  const [startOpen] = useState(() => !form.getValues(`rules.${index}.title`));

  return (
    <details
      open={startOpen}
      className="border-border bg-surface rounded-lg border [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3">
        <span className="text-muted-foreground w-5 text-xs tabular-nums">
          {index + 1}.
        </span>
        <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
          {title || "New rule"}
        </span>
        {err && <span className="text-destructive text-xs">Needs a fix</span>}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Move up"
          disabled={index === 0}
          onClick={(e) => {
            e.preventDefault();
            onMove(index - 1);
          }}
        >
          <ArrowUp className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Move down"
          disabled={index === count - 1}
          onClick={(e) => {
            e.preventDefault();
            onMove(index + 1);
          }}
        >
          <ArrowDown className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Delete rule"
          onClick={(e) => {
            e.preventDefault();
            onRemove();
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </summary>

      <div className="border-border space-y-4 border-t px-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor={id("title")}>Title</Label>
          <Input
            id={id("title")}
            maxLength={RULE_LIMITS.title}
            placeholder="Double contact on the set"
            {...register(`rules.${index}.title`)}
          />
          {err?.title && (
            <p className="text-destructive text-xs">{err.title.message}</p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register(`rules.${index}.houseRule`)} />
          House rule (specific to this league or gym)
        </label>

        <Field
          id={id("note")}
          label="Note under the title (optional)"
          rows={1}
          placeholder="This is a house rule because of the type of ceiling we have."
          error={err?.note?.message}
          {...register(`rules.${index}.note`)}
        />
        <Field
          id={id("was")}
          label="What it was (fill in for a rule change)"
          rows={2}
          error={err?.was?.message}
          {...register(`rules.${index}.was`)}
        />
        <Field
          id={id("now")}
          label={was ? "What it is now" : "The rule"}
          rows={4}
          error={err?.now?.message}
          {...register(`rules.${index}.now`)}
        />

        <div className="space-y-2">
          <p className="text-sm font-medium">More rows</p>
          {details.fields.map((d, j) => (
            <div key={d.id} className="flex items-start gap-2">
              <div className="grid flex-1 gap-2 sm:grid-cols-[10rem_1fr]">
                <Input
                  aria-label="Row label"
                  placeholder="Example"
                  maxLength={RULE_LIMITS.label}
                  {...register(`rules.${index}.details.${j}.label`)}
                />
                <textarea
                  aria-label="Row text"
                  rows={2}
                  className={AREA}
                  {...register(`rules.${index}.details.${j}.text`)}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove row"
                onClick={() => details.remove(j)}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          {details.fields.length < RULE_LIMITS.details && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => details.append({ label: "", text: "" })}
            >
              <Plus className="size-3.5" />
              Add a row (Example, Faults…)
            </Button>
          )}
        </div>

        <Field
          id={id("inShort")}
          label="In short (the one line players remember)"
          rows={2}
          error={err?.inShort?.message}
          {...register(`rules.${index}.inShort`)}
        />
      </div>
    </details>
  );
}

function Field({
  id,
  label,
  error,
  ...rest
}: React.ComponentProps<"textarea"> & {
  id: string;
  label: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea id={id} className={AREA} {...rest} />
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
