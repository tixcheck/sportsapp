import { DateTime } from "luxon";
import { CalendarClock } from "lucide-react";

import type { OrgPermits } from "@/lib/queries/permits";
import type { Permit, PermitDate } from "@/lib/venues/permits";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const NIGHT = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const time = (t: string) =>
  DateTime.fromFormat(t.slice(0, 5), "HH:mm").toFormat("h:mm");
const day = (d: string) => DateTime.fromISO(d).toFormat("LLL d");

/**
 * The organization's gym permits, night by night (0155) — what the schedule
 * is allowed to use. Read-only for now: BVL's came from their workbook.
 *
 * Each permit shows its regular booking, then only the nights that differ:
 * off (cancelled, breaks), different hours, and bookings at risk of
 * cancellation. A season of identical Tuesdays doesn't need listing.
 */
export function GymPermitsCard({ permits, dates }: OrgPermits) {
  if (permits.length === 0) return null;
  const byNight = new Map<number, Permit[]>();
  for (const p of permits) {
    byNight.set(p.dayOfWeek, [...(byNight.get(p.dayOfWeek) ?? []), p]);
  }
  const datesFor = (id: string) => dates.filter((d) => d.permitId === id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4" />
          Gym permits
        </CardTitle>
        <CardDescription>
          The gyms you have booked each night, and every night that differs —
          what schedules are built on.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {[...byNight.entries()].map(([dow, list]) => {
          const courts = list.reduce((n, p) => n + p.courts, 0);
          return (
            <section key={dow} className="space-y-2">
              <h3 className="text-sm font-semibold">
                {NIGHT[dow]}
                <span className="text-muted-foreground ml-2 font-normal">
                  {list.length} gym{list.length === 1 ? "" : "s"} · {courts}{" "}
                  courts · {day(list[0].startsOn)} – {day(list[0].endsOn)}
                </span>
              </h3>
              <ul className="divide-border divide-y rounded-lg border">
                {list.map((p) => (
                  <PermitRow key={p.id} permit={p} dates={datesFor(p.id)} />
                ))}
              </ul>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}

function PermitRow({
  permit: p,
  dates,
}: {
  permit: Permit;
  dates: PermitDate[];
}) {
  const off = dates.filter((d) => d.status === "cancelled");
  const changed = dates.filter((d) => d.status === "changed");
  const risk = dates.filter(
    (d) => d.status === "pending_cancel" || d.status === "cancel_requested",
  );
  return (
    <li className="space-y-1 p-3 text-sm">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">
          {p.venueName}
          {p.label && (
            <span className="text-muted-foreground font-normal">
              {" "}
              · {p.label}
            </span>
          )}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {p.courts} court{p.courts === 1 ? "" : "s"} · {time(p.startTime)}–
          {time(p.endTime)}
        </span>
      </p>
      {off.length > 0 && (
        <p className="text-xs">
          <span className="font-medium text-rose-800">Off:</span>{" "}
          {off
            .map((d) => `${day(d.onDate)}${d.note ? ` (${d.note})` : ""}`)
            .join(", ")}
        </p>
      )}
      {changed.length > 0 && (
        <p className="text-xs">
          <span className="font-medium text-sky-800">Different hours:</span>{" "}
          {changed
            .map(
              (d) =>
                `${day(d.onDate)} ${time(d.startTime!)}–${time(d.endTime!)}`,
            )
            .join(", ")}
        </p>
      )}
      {risk.length > 0 && (
        <p className="text-xs">
          <span className="font-medium text-amber-800">May be cancelled:</span>{" "}
          {risk
            .map((d) => `${day(d.onDate)}${d.note ? ` (${d.note})` : ""}`)
            .join(", ")}
        </p>
      )}
    </li>
  );
}
