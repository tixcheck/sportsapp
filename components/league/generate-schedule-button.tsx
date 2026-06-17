"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";

import { generateLeagueScheduleAction } from "@/server/actions/leagues";
import { Button } from "@/components/ui/button";

export function GenerateScheduleButton({
  competitionId,
  hasSchedule,
}: {
  competitionId: string;
  hasSchedule: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const result = await generateLeagueScheduleAction(competitionId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Schedule generated — ${result.matchCount} matches.`);
      router.refresh();
    });
  }

  return (
    <Button
      onClick={generate}
      disabled={pending}
      variant={hasSchedule ? "outline" : "default"}
    >
      <CalendarPlus />
      {pending
        ? "Generating…"
        : hasSchedule
          ? "Regenerate schedule"
          : "Generate schedule"}
    </Button>
  );
}
