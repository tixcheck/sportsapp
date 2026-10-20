"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin claret bar across the top while a tapped link loads. Pages without a
 * loading skeleton otherwise gave no sign a tap had registered (owner,
 * 2026-10-20: "I don't see if it was clicked or if it's loading").
 *
 * Starts on any same-site link tap that goes somewhere new, and finishes when
 * the URL changes. A safety timeout clears it if the navigation never lands.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.href || a.target === "_blank" || a.hasAttribute("download"))
        return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const here = window.location;
      if (url.pathname === here.pathname && url.search === here.search) return;
      clear();
      setPhase("loading");
      timers.current.push(window.setTimeout(() => setPhase("idle"), 15000));
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    setPhase((p) => {
      if (p !== "loading") return p;
      clear();
      timers.current.push(window.setTimeout(() => setPhase("idle"), 300));
      return "done";
    });
  }, [pathname, search]);

  if (phase === "idle") return null;
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
    >
      <div
        className={
          phase === "loading"
            ? "bg-claret h-full w-[85%] animate-[nav-progress_8s_cubic-bezier(0.1,0.7,0.2,1)]"
            : "bg-claret h-full w-full opacity-0 transition-[width,opacity] duration-300"
        }
      />
    </div>
  );
}
