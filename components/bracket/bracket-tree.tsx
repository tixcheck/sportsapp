import Link from "next/link";
import { SquarePen, Trophy } from "lucide-react";

import type { BracketEntryView, BracketView } from "@/lib/queries/bracket";
import { cn } from "@/lib/utils";
import { MyTeamBadge } from "@/components/team/my-team-badge";

function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${round}`;
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
      <span
        className={cn("flex-1 truncate", !entry && "text-text-3 italic")}
        title={entry?.name}
      >
        {entry ? entry.name : "TBD"}
      </span>
      {entry && myTeamIds.includes(entry.teamId) && <MyTeamBadge />}
      <span
        className={cn(
          "font-display w-5 text-right tabular-nums",
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
}: {
  bracket: BracketView;
  myTeamIds?: string[];
  /** Admin view: show an Enter/Edit-score link on each playable matchup. */
  editable?: boolean;
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
              {round.map((mt) => (
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
                  {editable && mt.home && mt.away && (
                    <Link
                      href={`/matches/${mt.id}`}
                      className="text-claret flex items-center justify-center gap-1 py-1.5 text-xs font-medium hover:underline"
                    >
                      <SquarePen className="size-3.5" />
                      {mt.status === "completed" ? "Edit score" : "Enter score"}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
