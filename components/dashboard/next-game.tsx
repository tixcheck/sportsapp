import Link from "next/link";
import { competitionPath } from "@/lib/queries/dashboard";
import { DateTime } from "luxon";
import { CalendarDays, MapPin } from "lucide-react";

import type { PlayerMatch } from "@/lib/queries/player-home";
import { formatPlacement } from "@/lib/venues/resolve";
import { Button } from "@/components/ui/button";
import { NetSetupNote } from "@/components/schedule/net-setup-note";
import { cn } from "@/lib/utils";

/**
 * When and where your next game is, and who it's against.
 *
 * The one question a player opens this app to answer, so it gets the top of the
 * screen and no click. The old dashboard listed competitions and made them go
 * looking, which is a fine answer to "what am I in" and no answer at all to
 * "where do I need to be on Tuesday".
 *
 * Times are shown relative first ("Tomorrow, 6:30pm") because that is how
 * somebody checking their phone on the way out of the door reads a date.
 */
export function NextGame({ match }: { match: PlayerMatch }) {
  const at = match.scheduledAt
    ? DateTime.fromISO(match.scheduledAt, { zone: match.timezone })
    : null;
  const now = at ? DateTime.now().setZone(match.timezone) : null;

  const when = (() => {
    if (!at || !now) return match.round ? `Round ${match.round}` : "Time TBC";
    const days = Math.floor(
      at.startOf("day").diff(now.startOf("day"), "days").days,
    );
    const time = at.toFormat("h:mm a");
    if (days === 0) return `Today, ${time}`;
    if (days === 1) return `Tomorrow, ${time}`;
    if (days > 1 && days < 7) return `${at.toFormat("cccc")}, ${time}`;
    return `${at.toFormat("ccc d LLL")}, ${time}`;
  })();

  // Within the next two days — not any time in the past.
  const hoursAway = at && now ? at.diff(now, "hours").hours : null;
  const soon = hoursAway != null && hoursAway > -3 && hoursAway <= 48;
  const opponent = match.opponentName;
  // Gym first: in a league across several schools, "Court a" alone doesn't say
  // where to drive.
  const court = formatPlacement(match.court, match.venueName, {
    multiVenue: true,
    sport: match.sport,
  });

  return (
    <section
      className={cn(
        "rounded-xl border p-5",
        soon ? "border-claret/50 bg-claret-tint/40" : "border-rule bg-surface",
      )}
    >
      <p className="text-ink-3 text-xs font-semibold tracking-[0.18em] uppercase">
        {match.role === "ref" ? "You're reffing next" : "Your next game"}
      </p>

      <p className="mt-2.5 text-2xl leading-tight font-semibold tracking-tight">
        {match.role === "ref" ? (
          opponent
        ) : (
          <>
            <span className="text-ink-3 text-lg font-normal">vs </span>
            {opponent}
          </>
        )}
      </p>

      <div className="text-ink-2 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <CalendarDays className="size-4" />
          {when}
        </span>
        {court && (
          <span className="flex items-center gap-1.5">
            <MapPin className="size-4" />
            {court}
          </span>
        )}
      </div>

      {match.netSetup && (
        <NetSetupNote
          court={match.court}
          sport={match.sport}
          className="mt-3 text-sm"
        />
      )}

      <p className="text-ink-3 mt-2 truncate text-sm">
        {match.competitionName}
        {match.phase === "bracket" && " · Playoffs"}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={competitionPath(match.competitionType, match.slug)}>
            Schedule &amp; standings
          </Link>
        </Button>
        {match.canEnter && (
          <Button asChild size="sm">
            <Link href={`/matches/${match.id}`}>Enter the score</Link>
          </Button>
        )}
        {match.lockedFuture && (
          <span className="text-ink-3 self-center text-xs">
            Scoring opens on game day.
          </span>
        )}
      </div>
    </section>
  );
}
