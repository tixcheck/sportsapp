"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";

import { reoptimizeScheduleAction } from "@/server/actions/pools";
import { Button } from "@/components/ui/button";

/**
 * Non-destructively re-optimizes the pool schedule: evens out wait times (and
 * repacks courts when nothing has been played yet). Preserves scores — started
 * pools and any played game stay put; only not-yet-played games move.
 */
export function ReoptimizeScheduleButton({
  competitionId,
}: {
  competitionId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function reoptimize() {
    start(async () => {
      const res = await reoptimizeScheduleAction(competitionId);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`Schedule re-optimized — ${res.updated} games adjusted.`);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={reoptimize}
      disabled={pending}
    >
      <Wand2 />
      {pending ? "Re-optimizing…" : "Re-optimize schedule"}
    </Button>
  );
}
