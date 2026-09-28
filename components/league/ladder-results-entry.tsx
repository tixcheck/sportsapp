"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check } from "lucide-react";

import { saveLadderNightResultsAction } from "@/server/actions/ladder-results";
import { orderByPoints } from "@/lib/scheduler/ladder-results";
import type { LadderTierView } from "@/lib/queries/ladder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  rows: z.array(
    z.object({
      teamId: z.string(),
      name: z.string(),
      points: z.string().regex(/^\d{0,3}$/, "Whole points only."),
    }),
  ),
});
type FormValues = z.infer<typeof formSchema>;

const toPoints = (s: string) => (s.trim() === "" ? null : Number(s));

/**
 * One gym's final standings for the night: the Total Points column off their
 * sheet, and the finishing order that follows from it.
 *
 * The ORDER is what's saved and what moves teams. Points suggest it — once
 * every team has a total the list sorts itself — but a tie on points is the
 * gym's call, so the arrows settle it and a re-sort never undoes them.
 */
export function TierResultsForm({
  competitionId,
  week,
  tier,
}: {
  competitionId: string;
  week: number;
  tier: LadderTierView;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const initial = [...tier.teams].sort((a, b) =>
    tier.standingsEntered
      ? (a.resultRank ?? 0) - (b.resultRank ?? 0)
      : a.position - b.position,
  );
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      rows: initial.map((t) => ({
        teamId: t.teamId,
        name: t.name,
        points: t.resultPoints == null ? "" : String(t.resultPoints),
      })),
    },
  });
  const { fields, move, replace } = useFieldArray({
    control: form.control,
    name: "rows",
  });
  const rows = useWatch({ control: form.control, name: "rows" }) ?? [];

  const { ties } = orderByPoints(
    rows.map((r) => ({ teamId: r.teamId, points: toPoints(r.points) })),
  );
  const nameOf = new Map(rows.map((r) => [r.teamId, r.name]));

  // Sort only once every total is in: re-ordering mid-entry would move the
  // row the organizer is about to tab into.
  function sortIfComplete() {
    const current = form.getValues("rows");
    if (current.some((r) => toPoints(r.points) == null)) return;
    if (current.some((r) => !/^\d{0,3}$/.test(r.points))) return;
    const { teamIds } = orderByPoints(
      current.map((r) => ({ teamId: r.teamId, points: toPoints(r.points) })),
    );
    const byId = new Map(current.map((r) => [r.teamId, r]));
    replace(teamIds.map((id) => byId.get(id)!));
  }

  function save(values: FormValues | null) {
    start(async () => {
      const res = await saveLadderNightResultsAction({
        competitionId,
        divisionId: tier.divisionId,
        week,
        results: (values?.rows ?? []).map((r) => ({
          teamId: r.teamId,
          points: toPoints(r.points),
        })),
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        values ? `${tier.name} standings saved.` : `${tier.name} cleared.`,
      );
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={form.handleSubmit(save)}
      className="border-border space-y-3 rounded-lg border p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display font-semibold">{tier.name}</p>
        {tier.standingsEntered ? (
          <span className="flex items-center gap-1 text-xs text-emerald-700">
            <Check className="size-3.5" /> Saved
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">Not entered</span>
        )}
      </div>

      <ol className="space-y-1.5">
        {fields.map((field, i) => {
          const error = form.formState.errors.rows?.[i]?.points?.message;
          return (
            <li key={field.id}>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-5 text-sm tabular-nums">
                  {i + 1}.
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {field.name}
                </span>
                <Input
                  inputMode="numeric"
                  aria-label={`${field.name} total points`}
                  placeholder="Pts"
                  className="h-8 w-16 text-right tabular-nums"
                  {...form.register(`rows.${i}.points`, {
                    onBlur: sortIfComplete,
                  })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Move ${field.name} up`}
                  disabled={i === 0 || pending}
                  onClick={() => move(i, i - 1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Move ${field.name} down`}
                  disabled={i === fields.length - 1 || pending}
                  onClick={() => move(i, i + 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
              </div>
              {error && (
                <p className="text-destructive mt-1 pl-7 text-xs">{error}</p>
              )}
            </li>
          );
        })}
      </ol>

      {ties.length > 0 && (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          {ties
            .map((group) => group.map((id) => nameOf.get(id)).join(" and "))
            .join("; ")}{" "}
          are level on points. Use the arrows to put them in the order they
          finished.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Save standings
        </Button>
        {tier.standingsEntered && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => save(null)}
          >
            Clear
          </Button>
        )}
      </div>
    </form>
  );
}
