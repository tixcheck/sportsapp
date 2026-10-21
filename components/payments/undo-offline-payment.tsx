"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { unconfirmOfflinePaymentAction } from "@/server/actions/organizer-payments";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Undo" on a payment recorded by hand (0122), for an individual's row (0185).
 * Two taps rather than a dialog, like the team rows: it's recoverable, and the
 * row is read on a phone.
 */
export function UndoOfflinePayment({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);

  function undo() {
    if (!asking) {
      setAsking(true);
      return;
    }
    start(async () => {
      const res = await unconfirmOfflinePaymentAction({ paymentId });
      setAsking(false);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.undone
          ? "Marked unpaid again — it's back in your inbox to confirm."
          : "That payment wasn't confirmed.",
      );
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className={cn("h-7 px-2", asking && "text-claret")}
      onClick={undo}
    >
      {asking ? "Not paid after all?" : "Undo"}
    </Button>
  );
}
