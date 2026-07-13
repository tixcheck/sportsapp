"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { setCompetitionCompletedAction } from "@/server/actions/competitions";
import { Button } from "@/components/ui/button";

/**
 * Organizer control to mark a competition finished (or reopen it). Completing
 * removes it from players' dashboards and My Matches even with unscored games —
 * useful when an event wraps up but not every result was entered.
 */
export function CompleteToggle({
  competitionId,
  status,
}: {
  competitionId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const completed = status === "completed";

  function toggle() {
    startTransition(async () => {
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
    });
  }

  return (
    <Button onClick={toggle} disabled={pending} variant="outline" size="sm">
      {completed ? <RotateCcw /> : <CheckCircle2 />}
      {pending ? "…" : completed ? "Reopen" : "Mark completed"}
    </Button>
  );
}
