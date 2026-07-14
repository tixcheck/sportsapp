"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { setCompetitionCompletedAction } from "@/server/actions/competitions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Organizer control to mark a competition finished (or reopen it). Completing
 * removes it from players' dashboards and My Matches even with unscored games,
 * so it's guarded by a confirm dialog — a co-organizer can't close an event by
 * a stray click. Reopening is a safe, reversible action and runs immediately.
 */
export function CompleteToggle({
  competitionId,
  status,
  completable,
}: {
  competitionId: string;
  status: string;
  /** True once the event's last date has passed — before that it's locked. */
  completable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const completed = status === "completed";
  // Locked until the event is over; a completed event can always be reopened.
  const locked = !completed && !completable;

  async function run() {
    const result = await setCompetitionCompletedAction(
      competitionId,
      !completed,
    );
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(
      completed
        ? "Reopened — it's back on players' dashboards."
        : "Marked completed — it's off players' dashboards.",
    );
    router.refresh();
  }

  if (completed) {
    return (
      <Button
        onClick={() => startTransition(run)}
        disabled={pending}
        variant="outline"
        size="sm"
      >
        <RotateCcw />
        {pending ? "…" : "Reopen"}
      </Button>
    );
  }

  return (
    <ConfirmDialog
      title="Mark this event completed?"
      description="It will drop off players' dashboards and My Matches — including any games that never got scores. You can reopen it afterwards if needed."
      confirmLabel="Mark completed"
      onConfirm={run}
      trigger={
        <Button
          disabled={locked}
          variant="outline"
          size="sm"
          title={
            locked
              ? "You can mark this completed once its last date has passed."
              : undefined
          }
        >
          <CheckCircle2 />
          Mark completed
        </Button>
      }
    />
  );
}
