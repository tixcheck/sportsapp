import {
  CalendarDays,
  Clock,
  MapPin,
  Ticket,
  Trophy,
  Users,
} from "lucide-react";
import { DateTime } from "luxon";

import type { RegistrationEvent } from "@/lib/queries/registration";
import { describeFormat } from "@/lib/formats";
import { formatCents } from "@/lib/payments/format";
import { toParagraphs } from "@/lib/email/broadcast";
import { mapsUrl } from "@/lib/venues/resolve";

const DAYS = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

/** "7:00 PM" from a stored "19:00". */
function clock(hhmm: string | null): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

function Fact({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <div className="border-border bg-surface rounded-lg border p-4">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="mt-1 font-medium">{value}</p>
      {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
    </div>
  );
}

/**
 * The facts a team wants before committing: when, where, what it costs, what
 * they'll actually play, and whether there's room.
 *
 * Almost all of this was already stored and never shown — the page asked people
 * to sign up for something it declined to describe.
 */
export function EventFacts({
  event,
  feeCents,
  splitAllowed,
}: {
  event: RegistrationEvent;
  /** Team fee, or null for a free event. */
  feeCents: number | null;
  splitAllowed: boolean;
}) {
  const dates = event.startDate
    ? DateTime.fromISO(event.startDate).toFormat("LLL d")
    : null;
  const endDate =
    event.endDate && event.endDate !== event.startDate
      ? DateTime.fromISO(event.endDate).toFormat("LLL d")
      : null;

  const window = [clock(event.startTime), clock(event.endTime)]
    .filter(Boolean)
    .join(" – ");

  const when = event.weekly
    ? `${DAYS[event.weekly.dayOfWeek] ?? "Weekly"}`
    : dates
      ? endDate
        ? `${dates} – ${endDate}`
        : dates
      : "Dates to be confirmed";

  const whenSub = event.weekly
    ? [
        clock(event.weekly.startTime),
        dates && endDate ? `${dates} – ${endDate}` : dates,
      ]
        .filter(Boolean)
        .join(" · ")
    : window || null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Fact icon={CalendarDays} label="When" value={when} sub={whenSub} />
      <Fact
        icon={MapPin}
        label="Where"
        value={event.venue ?? "Venue to be confirmed"}
        sub={
          event.venues.length > 1
            ? `${event.venues.length} venues`
            : (event.venues[0]?.address ?? null)
        }
      />
      <Fact
        icon={Ticket}
        label="Entry"
        value={feeCents === null ? "Free" : `${formatCents(feeCents)} per team`}
        sub={
          feeCents !== null && splitAllowed
            ? "Players can split it, or the captain pays"
            : null
        }
      />
      <Fact
        icon={Trophy}
        label="Format"
        value={describeFormat(event.matchFormat)}
        sub={
          event.divisions.length > 1
            ? `${event.divisions.length} ${event.divisionLabel.toLowerCase()}s`
            : null
        }
      />
    </div>
  );
}

/** The organizer's own words. Plain text — blank lines make paragraphs. */
export function EventDescription({ text }: { text: string }) {
  const paragraphs = toParagraphs(text);
  if (paragraphs.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold">About this event</h2>
      {paragraphs.map((p, i) => (
        <p key={i} className="text-foreground/90 leading-relaxed">
          {p}
        </p>
      ))}
    </section>
  );
}

/**
 * Where to go, and how to get in.
 *
 * The entry directions are the reason venues carry them: "enter through the
 * east doors by the garbage bins" is the difference between playing and
 * standing in a car park.
 */
export function EventVenues({ event }: { event: RegistrationEvent }) {
  if (event.venues.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold">
        {event.venues.length > 1 ? "Where you'll play" : "Getting there"}
      </h2>
      <ul className="space-y-3">
        {event.venues.map((v) => {
          const maps = mapsUrl(v);
          return (
            <li
              key={v.id}
              className="border-border bg-surface rounded-lg border p-4"
            >
              <p className="font-medium">{v.name}</p>
              {v.address && (
                <p className="text-muted-foreground text-sm">
                  {maps ? (
                    <a
                      href={maps}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-foreground inline-flex items-center gap-1 underline"
                    >
                      <MapPin className="size-3" />
                      {v.address}
                    </a>
                  ) : (
                    v.address
                  )}
                </p>
              )}
              {v.doorsNote && (
                <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
                  <Clock className="size-3.5" />
                  {v.doorsNote}
                </p>
              )}
              {v.entryNotes && (
                <p className="text-muted-foreground mt-1 text-sm italic">
                  {v.entryNotes}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** How full it is — the thing that turns "maybe" into "sign up now". */
export function SpotsBadge({ event }: { event: RegistrationEvent }) {
  if (event.spotsLeft === null) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
        <Users className="size-3.5" />
        {event.teamsRegistered} team{event.teamsRegistered === 1 ? "" : "s"} in
      </span>
    );
  }
  const tight = event.spotsLeft > 0 && event.spotsLeft <= 3;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium ${
        event.spotsLeft === 0
          ? "bg-muted text-muted-foreground"
          : tight
            ? "bg-amber-100 text-amber-900"
            : "bg-emerald-100 text-emerald-900"
      }`}
    >
      <Users className="size-3.5" />
      {event.spotsLeft === 0
        ? "Full"
        : `${event.spotsLeft} of ${event.maxTeams} spots left`}
    </span>
  );
}
