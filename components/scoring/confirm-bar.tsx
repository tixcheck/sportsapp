"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  confirmScoreAction,
  disputeScoreAction,
} from "@/server/actions/scores";
import { Button } from "@/components/ui/button";

export function ConfirmBar({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(
    fn: (
      id: string,
    ) => Promise<{ error: string } | { success: true; redirectTo?: string }>,
    label: string,
  ) {
    startTransition(async () => {
      const result = await fn(matchId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(label);
      // Confirm returns a role-aware target (organizer → admin page); dispute
      // has none → back to my matches.
      const to =
        "redirectTo" in result && result.redirectTo
          ? result.redirectTo
          : "/my-matches";
      router.push(to);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-3">
      <Button
        variant="outline"
        className="h-12 flex-1"
        disabled={pending}
        onClick={() => run(disputeScoreAction, "Score disputed.")}
      >
        Dispute
      </Button>
      <Button
        className="h-12 flex-1"
        disabled={pending}
        onClick={() => run(confirmScoreAction, "Score confirmed.")}
      >
        Confirm
      </Button>
    </div>
  );
}
