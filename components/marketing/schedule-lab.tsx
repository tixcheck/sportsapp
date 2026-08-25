"use client";

import { useMemo, useState } from "react";

import { generateRoundRobin } from "@/lib/scheduler/round-robin";
import { cn } from "@/lib/utils";

/**
 * The scheduler, running in the visitor's browser.
 *
 * This imports the SAME `generateRoundRobin` the app uses to draw a real
 * season — not a demo reimplementation. That is the whole point of the section:
 * a prospective organizer drags three sliders and watches the hardest thing
 * they do by hand happen in front of them, and what they are watching is the
 * product rather than a picture of it.
 *
 * It only works because `lib/scheduler/` is pure by rule (CLAUDE.md): no DB, no
 * imports at all in that module, so it costs nothing to ship to the client.
 */

/** Enough invented names for the largest roster the sliders allow. */
const NAMES = [
  "Block Party",
  "Net Gains",
  "Setting Ducks",
  "Served Cold",
  "Dig It",
  "The Liberos",
  "Side Out",
  "Spike Squad",
  "Bump Set Psycho",
  "Net Profits",
  "Hits & Giggles",
  "Sets on the Beach",
  "Ace Ventura",
  "Block & Roll",
  "Free Ballers",
  "Kill Switch",
  "Dinks & Drinks",
  "The Pancakes",
  "Off Speed",
  "Court Ordered",
];

const MIN_TEAMS = 4;
const MAX_TEAMS = 20;

/** The first playing night. Fixed so the draw is stable across renders. */
const START = "2026-09-01";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-09-08" -> "Tue, Sep 8", parsed as a plain date (never UTC-shifted). */
function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAY[date.getDay()]}, ${MONTH[m - 1]} ${d}`;
}

/** One playing night: time slots of up to `courts` games, plus who sat out. */
type Night = {
  date: string;
  slots: { court: number; homeTeamId: string; awayTeamId: string }[][];
  byes: string[];
};

export function ScheduleLab({ className }: { className?: string }) {
  const [teams, setTeams] = useState(12);
  const [courts, setCourts] = useState(3);
  const [weeks, setWeeks] = useState(8);

  const { nights, totalGames, gamesEach, slotsPerNight, elapsed } =
    useMemo(() => {
      const teamIds = Array.from({ length: teams }, (_, i) => String(i));
      const started = performance.now();
      const result = generateRoundRobin({
        teamIds,
        // Every team plays once a week for the season length they chose. The
        // generator adds rematch rounds itself once a full round robin runs out.
        gamesPerTeam: weeks,
        courts,
        startDate: START,
        intervalDays: 7,
      });
      const took = performance.now() - started;

      // The generator cycles courts within a round, so six games on three courts
      // means two back-to-back time slots — not six simultaneous games. Chunking
      // by court count is what makes the preview show a night an organizer would
      // recognise, and it is the difference between "48 games" and "48 games,
      // which is two slots a night".
      const nights: Night[] = [];
      for (const round of result.rounds) {
        let night = nights.find((n) => n.date === round.date);
        if (!night) {
          night = { date: round.date, slots: [], byes: [] };
          nights.push(night);
        }
        for (let i = 0; i < round.matches.length; i += courts) {
          night.slots.push(round.matches.slice(i, i + courts));
        }
        if (round.byeTeamId !== null) night.byes.push(round.byeTeamId);
      }

      const games = result.rounds.reduce((n, r) => n + r.matches.length, 0);
      const slotsPerNight = nights.length
        ? Math.max(...nights.map((n) => n.slots.length))
        : 0;
      return {
        nights,
        totalGames: games,
        gamesEach: teams > 0 ? Math.round((games * 2) / teams) : 0,
        slotsPerNight,
        elapsed: took,
      };
    }, [teams, courts, weeks]);

  const name = (id: string) => NAMES[Number(id) % NAMES.length];

  return (
    <div
      className={cn("grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]", className)}
    >
      <div className="border-rule bg-surface flex flex-col gap-5 rounded-xl border p-5 shadow-sm">
        <Slider
          label="Teams"
          value={teams}
          min={MIN_TEAMS}
          max={MAX_TEAMS}
          onChange={setTeams}
        />
        <Slider
          label="Courts"
          value={courts}
          min={1}
          max={6}
          onChange={setCourts}
        />
        <Slider
          label="Weeks"
          value={weeks}
          min={3}
          max={12}
          onChange={setWeeks}
        />

        <dl className="border-rule grid grid-cols-3 gap-2 border-t pt-4 text-center tabular-nums">
          <Stat value={totalGames} label="games" />
          <Stat value={gamesEach} label="each" />
          <Stat
            value={`${elapsed < 1 ? "<1" : Math.round(elapsed)}ms`}
            label="to draw"
          />
        </dl>

        <p className="text-ink-3 text-xs">
          {slotsPerNight > 1 ? (
            <>
              {slotsPerNight} time slots a night on {courts} court
              {courts === 1 ? "" : "s"}. Drawn by the same scheduler that builds
              a real season, running in your browser.
            </>
          ) : (
            <>
              One slot a night — every game at once. Drawn by the same scheduler
              that builds a real season, running in your browser.
            </>
          )}
        </p>
      </div>

      {/* A capped, scrolling preview: a 20-team, 12-week draw is 120 games and
          would otherwise push the rest of the page off the screen. */}
      <div
        className="border-rule bg-paper-sunken max-h-[26rem] overflow-y-auto rounded-xl border p-4"
        aria-live="polite"
        aria-atomic="false"
      >
        <ol className="flex flex-col gap-4">
          {nights.map((night, week) => (
            <li key={night.date} className="list-none">
              <p className="text-ink-2 text-xs font-semibold tracking-wide uppercase">
                Week {week + 1} · {formatDay(night.date)}
              </p>
              <div className="mt-2 flex flex-col gap-2">
                {night.slots.map((slot, si) => (
                  <div key={si}>
                    {night.slots.length > 1 && (
                      <p className="text-ink-3 mb-1 text-[0.68rem] tracking-wide uppercase">
                        Slot {si + 1}
                      </p>
                    )}
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {slot.map((m) => (
                        <li
                          key={`${m.court}-${m.homeTeamId}`}
                          className="border-rule bg-paper-raised flex items-baseline gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                        >
                          <span className="text-ink-3 shrink-0 text-xs tabular-nums">
                            Ct {m.court}
                          </span>
                          <span className="truncate">
                            {name(m.homeTeamId)}{" "}
                            <span className="text-ink-3">v</span>{" "}
                            {name(m.awayTeamId)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {night.byes.map((id) => (
                  <p key={`bye-${id}`} className="text-ink-3 text-xs">
                    Bye · {name(id)}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const id = `lab-${label.toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="font-display text-claret text-xl font-bold tabular-nums">
          {value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-claret focus-visible:ring-ring h-1.5 w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      />
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="font-display text-lg font-semibold">{value}</dd>
      <p className="text-ink-3 text-xs">{label}</p>
    </div>
  );
}
