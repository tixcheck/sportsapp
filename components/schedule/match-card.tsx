import { DateTime } from "luxon";

import type { ScheduleMatch } from "@/lib/queries/leagues";
import { cn } from "@/lib/utils";
import { MyTeamBadge } from "@/components/team/my-team-badge";
import { StatusPill } from "./status-pill";

const ROLE_STYLE = {
  play: "bg-primary text-primary-foreground",
  ref: "bg-amber-500 text-white",
} as const;

export function MatchCard({
  match,
  timezone,
  trailing,
  showAbnormal = false,
  myTeamIds = [],
  role,
}: {
  match: ScheduleMatch;
  timezone: string;
  trailing?: React.ReactNode;
  /** Show the organizer-only "Abnormal result" marker (admin views). */
  showAbnormal?: boolean;
  myTeamIds?: string[];
  /**
   * The highlighted team's role in this match — shows a bold Play/Ref tile.
   * Passed explicitly in the By-team view; otherwise derived from myTeamIds so
   * a viewer following their team sees at a glance whether they play or ref.
   */
  role?: "play" | "ref";
}) {
  const time = match.scheduledAt
    ? DateTime.fromISO(match.scheduledAt, { zone: timezone }).toFormat("h:mm a")
    : "TBD";

  const derivedRole: "play" | "ref" | null =
    (match.homeTeamId && myTeamIds.includes(match.homeTeamId)) ||
    (match.awayTeamId && myTeamIds.includes(match.awayTeamId))
      ? "play"
      : match.refTeamId && myTeamIds.includes(match.refTeamId)
        ? "ref"
        : null;
  const shownRole = role ?? derivedRole;

  // Show the result inline once a match is completed (derived from its sets).
  const homeWon = match.sets.filter((s) => s.home > s.away).length;
  const awayWon = match.sets.filter((s) => s.away > s.home).length;
  const final = match.status === "completed" && match.sets.length > 0;
  const homeRes = final
    ? homeWon > awayWon
      ? "win"
      : homeWon < awayWon
        ? "loss"
        : null
    : null;
  const awayRes = final
    ? awayWon > homeWon
      ? "win"
      : awayWon < homeWon
        ? "loss"
        : null
    : null;
  // Winner in claret (the brand voice), loser receding to muted ink (§2 risk).
  const resultColor = (r: "win" | "loss" | null) =>
    r === "win" ? "text-claret" : r === "loss" ? "text-ink-3" : undefined;

  return (
    <div className="border-border bg-surface rounded-lg border p-4 shadow-sm">
      {shownRole && (
        <span
          className={cn(
            "mb-2 inline-block rounded px-2 py-0.5 text-[0.7rem] font-bold tracking-wide uppercase",
            ROLE_STYLE[shownRole],
          )}
        >
          {shownRole === "play" ? "You play" : "You ref"}
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("truncate font-medium", resultColor(homeRes))}>
            {final && (
              <span className="font-display mr-2 tabular-nums">{homeWon}</span>
            )}
            {match.homeTeamName}
            {match.homeTeamId && myTeamIds.includes(match.homeTeamId) && (
              <MyTeamBadge className="ml-2" />
            )}
          </p>
          <p className="text-muted-foreground text-xs">vs</p>
          <p className={cn("truncate font-medium", resultColor(awayRes))}>
            {final && (
              <span className="font-display mr-2 tabular-nums">{awayWon}</span>
            )}
            {match.awayTeamName}
            {match.awayTeamId && myTeamIds.includes(match.awayTeamId) && (
              <MyTeamBadge className="ml-2" />
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <StatusPill status={match.status} />
          {showAbnormal && match.isAbnormal && (
            <span className="bg-claret-tint text-claret-deep mt-1 block rounded-[4px] px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
              Abnormal
            </span>
          )}
          {final ? (
            <p className="text-muted-foreground mt-1 text-xs tabular-nums">
              {match.sets.map((s) => `${s.home}–${s.away}`).join(", ")}
            </p>
          ) : (
            <p className="font-display mt-1 text-lg tabular-nums">{time}</p>
          )}
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
