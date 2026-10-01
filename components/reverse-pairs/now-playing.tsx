"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";

import type {
  ReversePairsGameRow,
  ReversePairsPair,
} from "@/lib/queries/reverse-pairs";
import { reversePairsNow } from "@/lib/schedule/reverse-pairs-now";
import { PairList } from "@/components/reverse-pairs/pair-list";

/**
 * "Now playing" for a Reverse Pairs event: the round on court, who's sitting
 * it out, and when the next one starts.
 *
 * The league board shows a game per court; here every court starts together
 * and the whole field rotates, so it shows one round. Who's sitting out is on
 * the board because in Reverse Pairs it changes every round — it's the other
 * half of "am I on now?".
 *
 * Rendered only after mount and re-evaluated each minute, like the league
 * board: the server can't know the viewer's clock, and the board has to open
 * and advance on its own while the page sits open at the side of a court.
 */
export function ReversePairsNowPlaying({
  games,
  byes,
  timezone,
}: {
  games: ReversePairsGameRow[];
  byes: ReversePairsPair[][];
  timezone: string;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;

  const board = reversePairsNow(games, byes, now, timezone);
  if (!board) return null;
  const time = (iso: string) =>
    DateTime.fromISO(iso, { zone: timezone }).toFormat("h:mm a");

  return (
    <section className="border-claret/30 bg-claret-tint/40 space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-1.5">
        <span className="bg-claret size-1.5 animate-pulse rounded-full motion-reduce:animate-none" />
        <h2 className="text-claret-deep font-display text-sm font-semibold">
          Now playing · Round {board.round}
        </h2>
        <span className="text-ink-3 text-xs">{time(board.at)}</span>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {board.games.map((g) => {
          const done = g.scoreA !== null && g.scoreB !== null;
          return (
            <li key={g.id} className="bg-surface space-y-1.5 rounded-md p-3">
              <p className="text-ink-3 text-xs font-medium">Court {g.court}</p>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2">
                <PairList pairs={g.sideA} won={done && g.scoreA! > g.scoreB!} />
                <p className="self-center text-sm font-semibold tabular-nums">
                  {done ? `${g.scoreA} – ${g.scoreB}` : "vs"}
                </p>
                <PairList
                  pairs={g.sideB}
                  won={done && g.scoreB! > g.scoreA!}
                  align="right"
                />
              </div>
            </li>
          );
        })}
      </ul>

      {(board.sittingOut.length > 0 || board.next) && (
        <div className="text-ink-2 space-y-0.5 text-xs">
          {board.sittingOut.length > 0 && (
            <p>
              <span className="font-medium">Sitting out:</span>{" "}
              {board.sittingOut.map((p) => p.name).join(", ")}
            </p>
          )}
          {board.next && (
            <p>
              <span className="font-medium">Up next:</span> Round{" "}
              {board.next.round} at {time(board.next.at)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
