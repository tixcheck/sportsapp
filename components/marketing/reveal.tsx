"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Fade-and-rise a block the first time it scrolls into view.
 *
 * Two things keep this from being decoration that costs you the page.
 *
 * It starts VISIBLE and is hidden only once the observer is attached, so a
 * visitor with JavaScript off — or one whose bundle hasn't landed yet — reads a
 * finished page rather than a blank one. Animating from a hidden initial state
 * in CSS is the usual way this goes wrong.
 *
 * And it observes once, then disconnects. Content that re-hides when you scroll
 * back up reads as a fault, not a flourish.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  /** Stagger, in ms, for siblings revealed as a group. */
  delay?: number;
  className?: string;
  /** `li` when the wrapper sits directly inside a list — a `div` there is
   *  invalid markup and browsers reparent it. */
  as?: "div" | "li";
}) {
  const ref = useRef<HTMLElement>(null);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) return setShown(true);

    // Anything already on screen at mount is treated as shown — animating the
    // hero on load would just delay the first thing the visitor came to read.
    const onScreen = el.getBoundingClientRect().top < window.innerHeight;
    setArmed(true);
    if (onScreen) return setShown(true);

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        io.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement & HTMLLIElement>}
      style={shown ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        "motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out",
        Tag === "li" && "list-none",
        // Print resets are not optional: paper has no scroll, so anything still
        // waiting for its intersection would come out of the printer blank.
        armed &&
          !shown &&
          "translate-y-4 opacity-0 print:translate-y-0 print:opacity-100",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
