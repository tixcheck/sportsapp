import { DateTime } from "luxon";

import type {
  ReversePairsGameRow,
  ReversePairsPair,
} from "@/lib/queries/reverse-pairs";

export interface ReversePairsNow {
  round: number;
  /** ISO start of the round, as scheduled. */
  at: string;
  games: ReversePairsGameRow[];
  sittingOut: ReversePairsPair[];
  next: { round: number; at: string } | null;
}

const scored = (g: ReversePairsGameRow) =>
  g.scoreA !== null && g.scoreB !== null;

/**
 * The round on court right now, for the "Now playing" board on a Reverse Pairs
 * event — or null when there's nothing to show.
 *
 * Reverse Pairs plays in rounds: every court starts together and the whole
 * field rotates, so the board is one ROUND, not a game per court as in a league
 * (`currentGames`). Time-gated the same way: nothing until `leadMinutes` before
 * the day's first round, and only rounds scheduled for today in the venue's
 * timezone.
 *
 * Which round is current: the latest one whose start time has passed (the
 * first, before play begins), moved on past any round already fully scored.
 * So the board advances when the organizer enters the scores OR when the next
 * round's start time arrives, whichever is first — an organizer who scores in
 * batches at the end doesn't leave the board stuck on round 2 all afternoon.
 * Once every remaining round is scored, the day is done and the board clears.
 *
 * `byes` is indexed like the rounds in order, as the event query builds it.
 */
export function reversePairsNow(
  games: ReversePairsGameRow[],
  byes: ReversePairsPair[][],
  now: Date,
  timezone: string,
  leadMinutes = 30,
): ReversePairsNow | null {
  const nowDt = DateTime.fromJSDate(now, { zone: timezone });
  const today = nowDt.toISODate();

  const allRounds = [...new Set(games.map((g) => g.game))].sort(
    (a, b) => a - b,
  );
  const rounds = allRounds
    .map((n, i) => {
      const inRound = games
        .filter((g) => g.game === n)
        .sort((a, b) => a.court - b.court);
      const at = inRound.find((g) => g.scheduledAt)?.scheduledAt ?? null;
      return { n, at, games: inRound, sittingOut: byes[i] ?? [] };
    })
    .filter(
      (r): r is typeof r & { at: string } =>
        r.at !== null &&
        DateTime.fromISO(r.at, { zone: timezone }).toISODate() === today,
    );
  if (rounds.length === 0) return null;

  const start = (at: string) => DateTime.fromISO(at, { zone: timezone });
  if (nowDt < start(rounds[0].at).minus({ minutes: leadMinutes })) return null;

  let i = 0;
  for (let k = 0; k < rounds.length; k++) {
    if (start(rounds[k].at) <= nowDt) i = k;
  }
  while (i < rounds.length && rounds[i].games.every(scored)) i++;
  if (i >= rounds.length) return null;

  const cur = rounds[i];
  const nxt = rounds[i + 1];
  return {
    round: cur.n,
    at: cur.at,
    games: cur.games,
    sittingOut: cur.sittingOut,
    next: nxt ? { round: nxt.n, at: nxt.at } : null,
  };
}
