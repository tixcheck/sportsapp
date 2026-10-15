import { DateTime } from "luxon";

/**
 * When each Reverse Pairs game starts.
 *
 * Game N starts N-1 game-lengths after the event's start; the courts inside a
 * game play at once. One place for this, because the draw and the settings
 * form both need it: before 2026-10-14 the settings form could change the date
 * or the game length and leave every drawn game at its old time (Helix asked
 * where the start time even was, and there was no field for it).
 *
 * Returns null for every game when there's no date or the time won't parse —
 * an untimed schedule beats a confidently wrong one.
 */
export function reversePairsGameStart(opts: {
  date: string | null;
  /** "HH:mm", local to the venue. */
  startTime: string;
  timezone: string;
  minutesPerGame: number;
  game: number;
}): string | null {
  if (!opts.date) return null;
  const start = DateTime.fromISO(
    `${opts.date.slice(0, 10)}T${opts.startTime}`,
    {
      zone: opts.timezone,
    },
  );
  if (!start.isValid) return null;
  return start.plus({ minutes: (opts.game - 1) * opts.minutesPerGame }).toISO();
}

/** "2:00 PM" → "5:20 PM" for a night of `games` games. */
export function reversePairsWindow(opts: {
  startTime: string;
  minutesPerGame: number;
  games: number;
}): { start: string; end: string } | null {
  const start = DateTime.fromFormat(opts.startTime, "HH:mm");
  if (!start.isValid || opts.games < 1) return null;
  return {
    start: start.toFormat("h:mm a"),
    end: start
      .plus({ minutes: opts.games * opts.minutesPerGame })
      .toFormat("h:mm a"),
  };
}
