import Link from "next/link";
import { DateTime } from "luxon";
import { CalendarDays, MapPin } from "lucide-react";

import { SPORTS } from "@/lib/formats";
import {
  promoDetailsHref,
  promoRegisterHref,
  spotsLine,
  type PromotedTournament,
} from "@/lib/registration/promoted";
import { Button } from "@/components/ui/button";

const SPORT_LABEL = new Map(SPORTS.map((s) => [s.value as string, s.label]));

/** "2026-11-08" -> "Sat, Nov 8". A plain date, never shifted through UTC. */
function eventDay(iso: string): string {
  return DateTime.fromISO(iso).toFormat("ccc, LLL d");
}

/** "Closes Fri, Oct 31" in the event's own timezone. */
function closesLine(t: PromotedTournament): string | null {
  if (!t.deadline) return null;
  const d = DateTime.fromISO(t.deadline).setZone(t.timezone);
  return `Closes ${d.toFormat("ccc, LLL d")}`;
}

/**
 * "Tournaments open for registration" on the dashboard (2026-10-14).
 *
 * Renders nothing when nothing qualifies: an empty promo box is noise. The
 * Register link carries `from=dashboard` so sign-ups from here can be told
 * apart later; the sign-up pages ignore the parameter.
 */
export function OpenTournaments({
  tournaments,
}: {
  tournaments: PromotedTournament[];
}) {
  if (tournaments.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">
          Tournaments open for registration
        </h2>
        <Link
          href="/find"
          className="text-claret shrink-0 text-sm font-medium hover:underline"
        >
          See all →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tournaments.map((t) => {
          const urgency = [spotsLine(t), closesLine(t)].filter(Boolean);
          return (
            <div
              key={t.id}
              className="border-rule bg-paper-raised flex flex-col gap-2 rounded-xl border p-4"
            >
              <span className="text-claret text-[0.68rem] font-semibold tracking-[0.12em] uppercase">
                {t.type === "reverse_pairs"
                  ? "Reverse Pairs"
                  : (SPORT_LABEL.get(t.sport) ?? t.sport)}{" "}
                · {t.orgName}
              </span>
              <Link
                href={promoDetailsHref(t)}
                className="font-display text-lg leading-snug font-semibold break-words hover:underline"
              >
                {t.name}
              </Link>
              <div className="text-ink-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                {t.startDate && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" />
                    {eventDay(t.startDate)}
                  </span>
                )}
                {t.venue && (
                  <span className="inline-flex min-w-0 items-center gap-1.5 break-words">
                    <MapPin className="size-3.5 shrink-0" />
                    {t.venue}
                  </span>
                )}
              </div>
              {urgency.length > 0 && (
                <p className="text-sm font-medium">{urgency.join(" · ")}</p>
              )}
              <Button asChild size="sm" className="mt-auto self-start">
                <Link href={promoRegisterHref(t)}>Register →</Link>
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
