"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DateTime } from "luxon";

import { setWaitlistEntryStatusAction } from "@/server/actions/waitlist";
import type { WaitlistEntry } from "@/lib/queries/waitlist";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const LABEL: Record<WaitlistEntry["status"], string> = {
  waiting: "Waiting",
  offered: "Offered",
  claimed: "Joined",
  expired: "Offer lapsed",
  removed: "Removed",
};

/**
 * The organizer's view of the queue.
 *
 * Read-mostly on purpose: offers are made automatically when a team leaves, so
 * the only thing an organizer needs here is to see the order and to take
 * somebody out. A manual "offer now" button would let them hand out a spot that
 * doesn't exist yet, which the database would refuse anyway.
 */
export function WaitlistCard({ entries }: { entries: WaitlistEntry[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (entries.length === 0) return null;

  const live = entries.filter(
    (e) => e.status === "waiting" || e.status === "offered",
  );

  function setStatus(entryId: string, status: "removed" | "waiting") {
    start(async () => {
      const res = await setWaitlistEntryStatusAction({ entryId, status });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(status === "removed" ? "Removed." : "Back in the queue.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Waitlist</CardTitle>
        <CardDescription>
          {live.length > 0
            ? `${live.length} team${live.length === 1 ? "" : "s"} waiting. When a team leaves, the next in line is offered the spot automatically and emailed a claim link.`
            : "Nobody is waiting right now."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ul className="divide-rule divide-y">
          {entries.map((e) => (
            <li
              key={e.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 py-3",
                (e.status === "removed" || e.status === "expired") &&
                  "opacity-60",
              )}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {e.position ? `${e.position}. ` : ""}
                  {e.teamName}
                  {e.divisionName && (
                    <span className="text-muted-foreground ml-2 text-xs font-normal">
                      {e.divisionName}
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {e.contactEmail}
                  {e.status === "offered" && e.offerExpiresAt
                    ? ` · claim by ${DateTime.fromISO(e.offerExpiresAt).toFormat("ccc h:mm a")}`
                    : ""}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    "rounded-[4px] px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                    e.status === "offered"
                      ? "bg-amber-100 text-amber-800"
                      : e.status === "claimed"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-paper-sunken text-ink-2",
                  )}
                >
                  {LABEL[e.status]}
                </span>

                {e.status === "removed" || e.status === "expired" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => setStatus(e.id, "waiting")}
                  >
                    Requeue
                  </Button>
                ) : e.status !== "claimed" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setStatus(e.id, "removed")}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
