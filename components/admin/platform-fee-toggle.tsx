"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { setPlatformFeeWaivedAction } from "@/server/actions/platform-fee";
import { cn } from "@/lib/utils";

/**
 * Whether the platform takes its cut of this competition.
 *
 * A per-event switch rather than a global rate, because the reason to give one
 * away is always about that one event — a first tournament for an organizer
 * being courted, a free run while the platform is being promoted. Changing the
 * global rates to do it would give it away to everybody.
 *
 * Reads as the state, not the action: "Fee waived" means no cut is being taken,
 * so the label says what is true rather than what the click would do.
 */
export function PlatformFeeToggle({
  competitionId,
  waived,
}: {
  competitionId: string;
  waived: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(waived);

  function toggle() {
    const next = !on;
    start(async () => {
      const res = await setPlatformFeeWaivedAction({
        competitionId,
        waived: next,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setOn(next);
      toast.success(
        next
          ? "Platform fee waived — new registrations take no cut."
          : "Platform fee back on for new registrations.",
      );
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={on}
      title={
        on
          ? "The platform takes no cut of this event. Click to charge the usual fee."
          : "The platform takes its usual cut. Click to waive it for this event."
      }
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase transition-colors",
        on
          ? "bg-pine/15 text-pine hover:bg-pine/25"
          : "bg-muted text-muted-foreground hover:bg-muted/70",
        pending && "opacity-50",
      )}
    >
      {on ? "Fee waived" : "Fee on"}
    </button>
  );
}
