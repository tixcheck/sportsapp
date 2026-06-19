"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setPoolNeedsDropAction } from "@/server/actions/pools";
import { cn } from "@/lib/utils";

/**
 * Per-pool "drop a game" flag (admin, on the Pool draw). When on, every team in
 * the pool drops one game from its own standings — the organizer picks the games
 * at seed time. Optimistic; reverts on error.
 */
export function NeedsDropToggle({
  poolId,
  initial,
}: {
  poolId: string;
  initial: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    start(async () => {
      const res = await setPoolNeedsDropAction(poolId, next);
      if ("error" in res) {
        setOn(!next);
        toast.error(res.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={on}
      title="Each team in this pool drops one game from its own standings"
      className={cn(
        "rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase transition-colors",
        on
          ? "border-claret text-claret"
          : "border-rule text-ink-3 hover:text-ink-2",
      )}
    >
      {on ? "Drop a game · on" : "Drop a game"}
    </button>
  );
}
