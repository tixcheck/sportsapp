"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Gently re-fetches the server-rendered page on an interval so a spectator sees
 * live scores without manually reloading. Pauses while the tab is hidden.
 */
export function AutoRefresh({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
