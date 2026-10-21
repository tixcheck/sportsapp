"use client";

import { useEffect } from "react";

/**
 * Scrolls the scorekeeper page to the game in the URL's #hash and flashes it.
 *
 * Done here rather than left to the browser: arriving by router.push after a
 * submit is a pushState, which neither reliably scrolls to the hash once the
 * page streams in nor updates CSS :target, so the highlight needs a class.
 */
export function ScrollToGame() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.classList.add("game-flash");
    const t = window.setTimeout(() => el.classList.remove("game-flash"), 2000);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
