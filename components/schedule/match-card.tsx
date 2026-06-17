import { DateTime } from "luxon";

import type { ScheduleMatch } from "@/lib/queries/leagues";
import { StatusPill } from "./status-pill";

export function MatchCard({
  match,
  timezone,
  trailing,
}: {
  match: ScheduleMatch;
  timezone: string;
  trailing?: React.ReactNode;
}) {
  const time = match.scheduledAt
    ? DateTime.fromISO(match.scheduledAt, { zone: timezone }).toFormat("h:mm a")
    : "TBD";

  return (
    <div className="border-border bg-surface rounded-lg border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{match.homeTeamName}</p>
          <p className="text-muted-foreground text-xs">vs</p>
          <p className="truncate font-medium">{match.awayTeamName}</p>
        </div>
        <div className="shrink-0 text-right">
          <StatusPill status={match.status} />
          <p className="font-display mt-1 text-lg tabular-nums">{time}</p>
        </div>
      </div>
      <div className="text-muted-foreground mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="truncate">
          {match.court ?? "Court TBD"}
          {match.refTeamName ? ` · Ref: ${match.refTeamName}` : ""}
        </span>
        {trailing}
      </div>
    </div>
  );
}
