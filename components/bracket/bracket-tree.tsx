import Link from "next/link";
import { DateTime } from "luxon";
import { SquarePen, Trophy } from "lucide-react";

import type {
  BracketEntryView,
  BracketMatchView,
  BracketView,
} from "@/lib/queries/bracket";
import type { ScheduleMatch } from "@/lib/queries/leagues";
import { cn } from "@/lib/utils";
import { MyTeamBadge } from "@/components/team/my-team-badge";
import { RescheduleDialog } from "@/components/schedule/reschedule-dialog";

/**
 * Adapt a bracket match to the ScheduleMatch shape the RescheduleDialog +
 * conflict check consume (bracket matches have no ref/sets context).
 */
export function toBracketScheduleMatch(m: BracketMatchView): ScheduleMatch {
  return {
    id: m.id,
    round: m.round,
    scheduledAt: m.scheduledAt,
    court: m.court,
    status: m.status,
    homeTeamId: m.home?.teamId ?? null,
    awayTeamId: m.away?.teamId ?? null,
    homeTeamName: m.home?.name ?? "TBD",
    awayTeamName: m.away?.name ?? "TBD",
    refTeamId: null,
    refTeamName: null,
    isAbnormal: false,
    sets: [],
  };
}

function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${round}`;
}

function fmtRatio(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "∞";
}

function TeamRow({
  entry,
  score,
  isWinner,
  myTeamIds,
}: {
  entry: BracketEntryView | null;
  score: number | null;
  isWinner: boolean;
  myTeamIds: string[];
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5 py-1.5 text-sm",
        isWinner ? "font-semibold" : "text-muted-foreground",
      )}
    >
      {entry?.seed != null ? (
        <span className="text-muted-foreground w-4 shrink-0 text-right text-xs tabular-nums">
          {entry.seed}
        </span>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn("truncate", !entry && "text-text-3 italic")}
            title={entry?.name}
          >
            {entry ? entry.name : "TBD"}
          </span>
          {entry && myTeamIds.includes(entry.teamId) && <MyTeamBadge />}
        </div>
        {entry?.record && (
          <span className="text-muted-foreground block text-[0.65rem] font-normal tabular-nums">
            {entry.record}
            {entry.ratio != null ? ` · ${fmtRatio(entry.ratio)}` : ""}
          </span>
        )}
      </div>
      <span
        className={cn(
          "font-display w-5 shrink-0 text-right tabular-nums",
          isWinner ? "text-claret font-semibold" : "text-ink-3",
        )}
      >
        {score ?? ""}
      </span>
    </div>
  );
}

export function BracketTree({
  bracket,
  myTeamIds = [],
  editable = false,
  timezone,
  allMatches,
}: {
  bracket: BracketView;
  myTeamIds?: string[];
  /** Admin view: show Enter/Edit-score + reschedule (court/time) on each match. */
  editable?: boolean;
  /** Required with `editable` for the reschedule dialog. */
  timezone?: string;
  /** All schedulable matches, for the reschedule conflict check. */
  allMatches?: ScheduleMatch[];
}) {
  const total = bracket.rounds.length;
  if (total === 0) return null;

  return (
    <div className="space-y-4">
      {bracket.championName && (
        <div className="border-claret/30 bg-claret-tint flex items-center gap-2 rounded-lg border px-4 py-3">
          <Trophy className="text-claret size-5" />
          <span className="font-display text-claret-deep text-lg font-semibold">
            {bracket.championName}
          </span>
          <span className="text-ink-2 text-sm">— Champions</span>
        </div>
      )}

      {bracket.rounds.flat().some((m) => m.scheduledAt) && (
        <p className="text-ink-2 text-xs italic">
          Match order is set; times are estimates.
        </p>
      )}

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-6">
          {bracket.rounds.map((round, i) => (
            <div
              key={i}
              className="flex min-w-52 flex-1 flex-col justify-around gap-4"
            >
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {roundLabel(i + 1, total)}
              </p>
              {round.map((mt) => {
                const timeText =
                  mt.scheduledAt && timezone
                    ? DateTime.fromISO(mt.scheduledAt, {
                        zone: timezone,
                      }).toFormat("h:mm a")
                    : null;
                // e.g. "2:30 PM · Court 1"; "Time TBD" only in the admin view.
                const meta =
                  [timeText, mt.court].filter(Boolean).join(" · ") ||
                  (editable ? "Time TBD" : "");
                return (
                  <div
                    key={mt.id}
                    className="border-border bg-surface divide-border divide-y rounded-lg border shadow-sm"
                  >
                    <TeamRow
                      entry={mt.home}
                      score={mt.homeScore}
                      isWinner={
                        !!mt.winnerTeamId && mt.winnerTeamId === mt.home?.teamId
                      }
                      myTeamIds={myTeamIds}
                    />
                    <TeamRow
                      entry={mt.away}
                      score={mt.awayScore}
                      isWinner={
                        !!mt.winnerTeamId && mt.winnerTeamId === mt.away?.teamId
                      }
                      myTeamIds={myTeamIds}
                    />
                    {(meta || editable) && (
                      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {meta}
                        </span>
                        <div className="flex items-center gap-1">
                          {editable && mt.home && mt.away && (
                            <Link
                              href={`/matches/${mt.id}`}
                              className="text-claret inline-flex items-center gap-1 text-xs font-medium hover:underline"
                            >
                              <SquarePen className="size-3.5" />
                              {mt.status === "completed"
                                ? "Edit score"
                                : "Enter score"}
                            </Link>
                          )}
                          {editable && timezone && allMatches && (
                            <RescheduleDialog
                              match={toBracketScheduleMatch(mt)}
                              allMatches={allMatches}
                              timezone={timezone}
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
