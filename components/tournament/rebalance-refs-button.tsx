"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Scale } from "lucide-react";
import { toast } from "sonner";

import { rebalanceRefsAction } from "@/server/actions/pools";
import { Button } from "@/components/ui/button";

/**
 * Evens out the ref load across existing pool matches — changes only who
 * referees; pairings, times, courts, and scores stay put.
 */
export function RebalanceRefsButton({
  competitionId,
}: {
  competitionId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function rebalance() {
    start(async () => {
      const res = await rebalanceRefsAction(competitionId);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`Refs rebalanced across ${res.updated} games.`);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={rebalance}
      disabled={pending}
    >
      <Scale />
      {pending ? "Rebalancing…" : "Rebalance refs"}
    </Button>
  );
}
