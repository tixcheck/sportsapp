"use client";

import { useEffect, useRef } from "react";

/**
 * Tells the hosting page how tall this embed wants to be.
 *
 * An iframe can't size itself — the parent owns its height, and a fixed one
 * either clips a long schedule or leaves a slab of empty space under a short
 * one. So the embed measures itself and posts the number out; a host that wants
 * auto-sizing listens for it, and a host that doesn't is unaffected.
 *
 * The message is deliberately namespaced and posted to "*": we don't know which
 * site is embedding, and the payload is a single integer that is already public
 * on the page itself, so there is nothing here worth restricting an origin for.
 */
export function EmbedAutoHeight({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined" || window.parent === window)
      return;

    let last = 0;
    const post = () => {
      // Round up: a fractional height rounds down in the parent and clips the
      // final row by a pixel, which reads as a rendering bug.
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height === last) return;
      last = height;
      window.parent.postMessage({ type: "mysportsapp:height", height }, "*");
    };

    post();
    const observer = new ResizeObserver(post);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref}>{children}</div>;
}
