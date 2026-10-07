"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { setScheduleViewsAction } from "@/server/actions/leagues";
import {
  SCHEDULE_VIEWS,
  SCHEDULE_VIEW_LABELS,
  isScheduleViewKey,
  type ScheduleViewKey,
} from "@/lib/schedule/schedule-views";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Pick the schedule views a league offers (0158). Mango Coed asked for just
 * By tier and By court — six buttons was more than their players needed.
 * Nothing ticked = the default set.
 */
export function ScheduleViewsCard({
  competitionId,
  initial,
}: {
  competitionId: string;
  initial: string[] | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Set<ScheduleViewKey>>(
    () => new Set((initial ?? []).filter(isScheduleViewKey)),
  );
  // Canonical order, so the schedule always opens on the same view.
  const ordered = SCHEDULE_VIEWS.filter((v) => picked.has(v));
  const saved = (initial ?? []).join() === ordered.join();

  function toggle(v: ScheduleViewKey) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  function save() {
    start(async () => {
      const res = await setScheduleViewsAction({
        competitionId,
        views: ordered,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.views
          ? `Schedule shows ${res.views.map((v) => SCHEDULE_VIEW_LABELS[v as ScheduleViewKey]).join(" and ")}.`
          : "Schedule shows the default views.",
      );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule views</CardTitle>
        <CardDescription>
          The buttons above the schedule, here and on the public page. Tick only
          the ones your players use; the schedule opens on the first. Leave all
          unticked for the default set.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SCHEDULE_VIEWS.map((v) => (
            <label
              key={v}
              className="border-border has-[:checked]:border-primary has-[:checked]:bg-accent flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={picked.has(v)}
                onChange={() => toggle(v)}
              />
              {SCHEDULE_VIEW_LABELS[v]}
            </label>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          {ordered.length === 0
            ? "Showing the default views."
            : `Opens on ${SCHEDULE_VIEW_LABELS[ordered[0]]}.`}
        </p>
        <Button
          onClick={save}
          disabled={pending || saved}
          className="w-full sm:w-auto"
        >
          {pending ? "Saving…" : "Save views"}
        </Button>
      </CardContent>
    </Card>
  );
}
