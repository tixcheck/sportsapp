import { AlertTriangle, CheckCircle2 } from "lucide-react";

import type {
  VenueIssue,
  VenueIssueKind,
} from "@/lib/scheduler/venue-conflicts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** How loudly to say it: a clash stops a game, a split is a judgement call. */
const TONE: Record<VenueIssueKind, string> = {
  court_double_booked: "bg-rose-100 text-rose-900",
  team_double_booked: "bg-rose-100 text-rose-900",
  venue_over_capacity: "bg-amber-100 text-amber-900",
  team_travels: "bg-sky-100 text-sky-900",
  division_split: "bg-sky-100 text-sky-900",
};

const LABEL: Record<VenueIssueKind, string> = {
  court_double_booked: "Court clash",
  team_double_booked: "Team clash",
  venue_over_capacity: "Over capacity",
  team_travels: "Travel",
  division_split: "Split division",
};

/**
 * Venue problems in this league's schedule.
 *
 * A Server Component — the audit runs on the server against the real schedule,
 * so there's nothing to hydrate. Shown even when clean, because "no problems"
 * is the reassurance an organizer wants before publishing, and a card that only
 * appears when something is wrong is a card nobody trusts is running.
 */
export function ScheduleIssuesCard({ issues }: { issues: VenueIssue[] }) {
  const blocking = issues.filter(
    (i) => i.kind === "court_double_booked" || i.kind === "team_double_booked",
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {issues.length === 0 ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="size-4 text-amber-600" />
          )}
          Schedule check
        </CardTitle>
        <CardDescription>
          {issues.length === 0
            ? "No court clashes, no team double-booked, and nobody driving between venues mid-night."
            : blocking > 0
              ? `${blocking} problem${blocking === 1 ? "" : "s"} would stop a game being played. Fix these before you publish.`
              : "Nothing blocking, but these are worth a look."}
        </CardDescription>
      </CardHeader>

      {issues.length > 0 && (
        <CardContent>
          <ul className="space-y-2">
            {issues.map((issue, i) => (
              <li
                key={`${issue.kind}-${i}`}
                className="flex flex-wrap items-start gap-2 text-sm"
              >
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${TONE[issue.kind]}`}
                >
                  {LABEL[issue.kind]}
                </span>
                <span className="min-w-0 flex-1">{issue.summary}</span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {issue.matchIds.length} game
                  {issue.matchIds.length === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
