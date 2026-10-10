import Link from "next/link";
import { CalendarClock, CircleAlert, CircleCheck } from "lucide-react";

import type { ScheduleGate } from "@/lib/queries/schedule-gate";

/**
 * Shown in place of the schedule when the league shares it with ready teams
 * only (0161). A visitor learns why; a player on a team that isn't ready
 * learns exactly what's missing, which is the point — a blank tab tells a
 * captain nothing.
 */
export function ScheduleGateCard({ gate }: { gate: ScheduleGate }) {
  return (
    <div className="border-border bg-surface space-y-4 rounded-lg border p-6">
      <div className="flex items-start gap-3">
        <CalendarClock className="text-muted-foreground mt-0.5 size-5 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">
            The schedule is shared with teams once their roster is complete.
          </p>
          <p className="text-muted-foreground text-sm">
            A team is complete when enough players have joined and every one has
            signed the league&apos;s waiver.
          </p>
        </div>
      </div>

      {gate.myTeams.length > 0 ? (
        <ul className="space-y-3">
          {gate.myTeams.map((t) => {
            const short =
              t.minRoster != null ? Math.max(0, t.minRoster - t.joined) : 0;
            return (
              <li key={t.name} className="border-border rounded-md border p-3">
                <p className="font-medium">{t.name}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    {short === 0 ? (
                      <CircleCheck className="size-4 text-emerald-600" />
                    ) : (
                      <CircleAlert className="size-4 text-amber-600" />
                    )}
                    {t.joined}
                    {t.minRoster != null ? ` of ${t.minRoster}` : ""} players
                    joined
                    {short > 0 &&
                      ` — ${short} more needed${t.invited ? ` (${t.invited} invited, not joined yet)` : ""}`}
                  </li>
                  <li className="flex items-center gap-2">
                    {t.unsigned === 0 ? (
                      <CircleCheck className="size-4 text-emerald-600" />
                    ) : (
                      <CircleAlert className="size-4 text-amber-600" />
                    )}
                    {t.unsigned === 0
                      ? "Every player has signed the waiver"
                      : `${t.unsigned} player${t.unsigned === 1 ? " hasn't" : "s haven't"} signed the waiver`}
                  </li>
                </ul>
              </li>
            );
          })}
          <li className="text-muted-foreground text-sm">
            Captains can invite players from{" "}
            <Link href="/dashboard" className="underline">
              your dashboard
            </Link>
            . The schedule appears here as soon as the team is complete.
          </li>
        </ul>
      ) : (
        !gate.signedIn && (
          <p className="text-muted-foreground text-sm">
            On a team?{" "}
            <Link href="/login" className="underline">
              Sign in
            </Link>{" "}
            to see your schedule.
          </p>
        )
      )}
    </div>
  );
}
