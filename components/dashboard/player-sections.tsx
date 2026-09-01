import Link from "next/link";
import { DateTime } from "luxon";

import type { PlayerMatch, PlayerStandingRow } from "@/lib/queries/player-home";
import { formatCourtLabel } from "@/lib/scheduler/court-label";
import { cn } from "@/lib/utils";

/** "Tue 1 Sep, 6:30pm" — or the round, when a fixture carries no time. */
function shortWhen(m: PlayerMatch): string {
  if (!m.scheduledAt) return m.round ? `Round ${m.round}` : "Time TBC";
  return DateTime.fromISO(m.scheduledAt, { zone: m.timezone }).toFormat(
    "ccc d LLL, h:mm a",
  );
}

/**
 * How your last few games went.
 *
 * Result first and in colour, because "did we win" is read before the score is.
 * Games this player only reffed are still listed but carry no W or L — the
 * result was somebody else's.
 */
export function RecentResults({ matches }: { matches: PlayerMatch[] }) {
  if (matches.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold">Recent results</h2>
      <ul className="divide-rule border-rule bg-surface divide-y rounded-lg border">
        {matches.map((m) => (
          <li key={m.id} className="flex items-center gap-3 p-3">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                m.result === "won" && "bg-pine/15 text-pine",
                m.result === "lost" && "bg-claret/10 text-claret",
                m.result === "tied" && "bg-paper-sunken text-ink-2",
                !m.result && "bg-paper-sunken text-ink-3",
              )}
              title={m.result ?? "You reffed this game"}
            >
              {m.result === "won"
                ? "W"
                : m.result === "lost"
                  ? "L"
                  : m.result === "tied"
                    ? "T"
                    : "·"}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {m.role === "ref" ? m.opponentName : `vs ${m.opponentName}`}
              </span>
              <span className="text-ink-3 block truncate text-xs">
                {m.competitionName} · {shortWhen(m)}
              </span>
            </span>

            {m.score && (
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {m.score[0]}&ndash;{m.score[1]}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Everything after the next game, so a player can plan past Tuesday. */
export function UpcomingGames({ matches }: { matches: PlayerMatch[] }) {
  if (matches.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold">Also coming up</h2>
      <ul className="divide-rule border-rule bg-surface divide-y rounded-lg border">
        {matches.map((m) => {
          const court = formatCourtLabel(m.court, m.sport);
          return (
            <li key={m.id} className="flex items-center gap-3 p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {m.role === "ref"
                    ? `Reffing ${m.opponentName}`
                    : `vs ${m.opponentName}`}
                </span>
                <span className="text-ink-3 block truncate text-xs">
                  {m.competitionName}
                  {court && ` · ${court}`}
                </span>
              </span>
              <span className="text-ink-2 shrink-0 text-xs whitespace-nowrap">
                {shortWhen(m)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Where each of your teams sits in its table.
 *
 * The thing a league player actually wants and most team apps don't have,
 * because they are built around a single team rather than a competition. We
 * already compute standings properly, so this is nearly free — and it is the
 * reason to open the app on a day you are not playing.
 */
export function YourTeams({ rows }: { rows: PlayerStandingRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold">Your teams</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <Link
            key={`${r.competitionId}:${r.teamId}`}
            href={`/l/${r.slug}?tab=standings`}
            className="border-rule bg-surface hover:bg-paper-sunken block rounded-lg border p-4 transition-colors"
          >
            <p className="truncate text-sm font-semibold">{r.teamName}</p>
            <p className="text-ink-3 truncate text-xs">{r.competitionName}</p>

            <div className="mt-3 flex items-baseline gap-3">
              {r.position ? (
                <span className="text-2xl leading-none font-semibold tabular-nums">
                  {r.position}
                  <span className="text-ink-3 text-sm font-normal">
                    {ordinal(r.position)} of {r.teamsInTable}
                  </span>
                </span>
              ) : (
                <span className="text-ink-3 text-sm">Not played yet</span>
              )}
            </div>

            {r.played > 0 && (
              <p className="text-ink-2 mt-2 text-xs tabular-nums">
                {r.won}&ndash;{r.lost} · {r.differential > 0 ? "+" : ""}
                {r.differential}
                {r.seasonDone && (
                  <span className="text-ink-3"> · season complete</span>
                )}
              </p>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

/** "st", "nd", "rd", "th" — 11–13 are the exceptions that catch people out. */
function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}
