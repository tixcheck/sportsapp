"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type Shot = {
  id: string;
  /** The pill label. Two words at most — these sit in a row on a phone. */
  label: string;
  /** Shown under the frame; says what the visitor is looking at. */
  caption: string;
  src: string;
  width: number;
  height: number;
  alt: string;
  /** Appears in the frame's address bar. Real, so it can be checked. */
  url: string;
};

const DWELL_MS = 5000;

/**
 * A browser-framed screenshot that cycles through the pages a player sees.
 *
 * The frame is deliberate: a bare screenshot of a cream page on a cream site
 * dissolves into the background, and the address bar is what tells a visitor
 * this is a real page at a real URL rather than a drawing of one.
 *
 * Every image is mounted and only opacity changes, so switching is instant
 * instead of showing a gap while the next PNG decodes. The first is `priority`
 * — it's the hero — and the rest load eagerly behind it for the same reason.
 */
export function ScreenshotShowcase({
  shots,
  className,
}: {
  shots: Shot[];
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [cycling, setCycling] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    // Auto-advance is an invitation, not a carousel people have to fight. It
    // never runs under reduced-motion, and stops for good once someone picks a
    // tab themselves — at that point they are reading, not browsing.
    setCycling(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (!cycling || paused) return;
    const t = setTimeout(
      () => setIndex((i) => (i + 1) % shots.length),
      DWELL_MS,
    );
    return () => clearTimeout(t);
  }, [cycling, paused, index, shots.length]);

  const pick = useCallback((i: number) => {
    setIndex(i);
    setCycling(false);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + shots.length) % shots.length;
    pick(next);
    tabs.current[next]?.focus();
  };

  const active = shots[index];

  return (
    <div
      // min-w-0 all the way down to the truncating URL: a flex/grid item
      // defaults to min-width:auto, so one nowrap span would otherwise widen
      // the whole hero column past the viewport and get clipped.
      className={cn("flex min-w-0 flex-col gap-4", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        role="tablist"
        aria-label="Pages your players see"
        onKeyDown={onKeyDown}
        className="border-rule bg-paper-sunken/70 flex flex-wrap gap-1 self-start rounded-full border p-1"
      >
        {shots.map((shot, i) => (
          <button
            key={shot.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`shot-tab-${shot.id}`}
            aria-selected={i === index}
            aria-controls={`shot-panel-${shot.id}`}
            tabIndex={i === index ? 0 : -1}
            onClick={() => pick(i)}
            className={cn(
              "focus-visible:ring-ring relative rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
              i === index
                ? "bg-claret text-paper-raised shadow-sm"
                : "text-ink-2 hover:text-ink",
            )}
          >
            {shot.label}
          </button>
        ))}
      </div>

      <div className="border-rule bg-paper-sunken overflow-hidden rounded-xl border shadow-lg">
        <div className="border-rule bg-paper-raised flex min-w-0 items-center gap-1.5 border-b px-3 py-2">
          <i className="bg-rule size-2 rounded-full" aria-hidden="true" />
          <i className="bg-rule size-2 rounded-full" aria-hidden="true" />
          <i className="bg-rule size-2 rounded-full" aria-hidden="true" />
          <span className="text-ink-3 ml-2 min-w-0 truncate text-[0.7rem]">
            {active.url}
          </span>
        </div>

        {/* A fixed box the images crossfade inside: letting each shot set its
            own height would jolt the page every five seconds. Sized to the
            TALLEST shot so `contain` never has to crop one — a standings table
            with its last row sliced off is the one thing this section must not
            show. */}
        <div className="relative aspect-[1000/1015]">
          {shots.map((shot, i) => (
            <div
              key={shot.id}
              role="tabpanel"
              id={`shot-panel-${shot.id}`}
              aria-labelledby={`shot-tab-${shot.id}`}
              // `inert` rather than `hidden`: hidden would drop the panel from
              // layout mid-transition and there would be no crossfade at all.
              // This keeps it painted but out of the reading and tab order.
              inert={i !== index}
              aria-hidden={i !== index}
              className={cn(
                "absolute inset-0 motion-safe:transition-opacity motion-safe:duration-500",
                i === index ? "opacity-100" : "opacity-0",
              )}
            >
              <Image
                src={shot.src}
                alt={shot.alt}
                width={shot.width}
                height={shot.height}
                priority={i === 0}
                sizes="(min-width: 1024px) 560px, 100vw"
                className="h-full w-full object-contain object-top"
              />
            </div>
          ))}
        </div>
      </div>

      <p className="text-ink-2 min-h-[2.75rem] text-sm" aria-live="polite">
        {active.caption}
      </p>
    </div>
  );
}
