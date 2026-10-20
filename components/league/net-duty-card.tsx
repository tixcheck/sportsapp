"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { setNetDutyAction } from "@/server/actions/ladder";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NET_SETUP_MINUTES } from "@/lib/scheduler/net-duty";

/** The league's net-duty switch (0179), under its schedule. */
export function NetDutyCard({
  competitionId,
  on: initial,
}: {
  competitionId: string;
  on: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Net setup</CardTitle>
        <CardDescription>
          So setting up doesn&apos;t fall on the referee.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            className="accent-primary mt-0.5 size-4 shrink-0"
            checked={on}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked;
              setOn(next);
              start(async () => {
                const res = await setNetDutyAction(competitionId, next);
                if ("error" in res) {
                  setOn(!next);
                  toast.error(res.error);
                  return;
                }
                toast.success(
                  next
                    ? "Teams will see when they put up the net."
                    : "Net duty is off.",
                );
                router.refresh();
              });
            }}
          />
          <span>
            <span className="font-medium">Name a team to put up each net</span>
            <span className="text-muted-foreground block">
              The first game on each court in each gym needs its net put up, and
              the last game&apos;s net comes down. One of the two teams in each
              is named, taking turns so every team does it and none does it more
              than others. They see &ldquo;Your team puts up the net. Arrive{" "}
              {NET_SETUP_MINUTES} min early.&rdquo; or &ldquo;Your team takes
              the net down after this game.&rdquo; on their game, the dashboard
              and the weekly email, and both are on the printed round schedule.
              It follows the schedule, so a moved game or a redraw updates it.
            </span>
          </span>
        </label>
      </CardContent>
    </Card>
  );
}
