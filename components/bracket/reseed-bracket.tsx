import Link from "next/link";
import { DateTime } from "luxon";
import { Trophy, SquarePen } from "lucide-react";

import {
  reseedRoundLabel,
  type ReseedBracketView,
  type ReseedMatchView,
} from "@/lib/queries/reseed-bracket";
import { cn } from "@/lib/utils";

/**
 * A re-seeding playoff bracket, round by round. Each round re-ranks survivors by
 * seed and pairs highest-vs-lowest, so later rounds only appear once the current
 * one finishes (there's no fixed tree to draw). Admins get a score-entry link.
 */
export function ReseedBracket({
  bracket,
  timezone,
  editable = false,
  myTeamIds = [],
}: {
  bracket: ReseedBracketView;
  timezone: string;
  editable?: boolean;
  myTeamIds?: string[];
}) {
  const total = bracket.rounds.length;

  return (
    <div className="space-y-6">
      {bracket.championName && (
        <div className="border-primary/30 from-primary/10 flex items-center justify-center gap-2 rounded-xl border bg-gradient-to-b to-transparent p-4">
          <Trophy className="text-primary size-5" />
          <span className="font-display text-lg font-semibold">
            {bracket.championName}
          </span>
          <span className="text-muted-foreground text-sm">champion</span>
        </div>
      )}

      {bracket.rounds.map((round, i) => (
        <section key={i} className="space-y-2">
          <h4 className="font-display text-sm font-semibold">
            {reseedRoundLabel(i + 1, total)}
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {round.map((m) => (
              <ReseedMatch
                key={m.id}
                m={m}
                timezone={timezone}
                editable={editable}
                myTeamIds={myTeamIds}
              />
            ))}
          </div>
        </section>
      ))}

      {bracket.nextRoundPending && (
        <p className="text-muted-foreground text-sm">
          The next round will be drawn from these results.
        </p>
      )}
    </div>
  );
}

function Side({
  name,
  seed,
  score,
  winner,
  mine,
}: {
  name: string | null;
  seed: number | null;
  score: number | null;
  winner: boolean;
  mine: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2">
        {seed != null && (
          <span className="text-ink-3 w-4 text-right text-xs tabular-nums">
            {seed}
          </span>
        )}
        <span
          className={cn(
            "truncate text-sm",
            winner ? "font-semibold" : "text-muted-foreground",
            mine && "text-primary",
          )}
        >
          {name ?? "TBD"}
        </span>
      </span>
      {score != null && (
        <span className={cn("text-sm tabular-nums", winner && "font-semibold")}>
          {score}
        </span>
      )}
    </div>
  );
}

function ReseedMatch({
  m,
  timezone,
  editable,
  myTeamIds,
}: {
  m: ReseedMatchView;
  timezone: string;
  editable: boolean;
  myTeamIds: string[];
}) {
  const when = m.scheduledAt
    ? DateTime.fromISO(m.scheduledAt, { zone: timezone }).toFormat(
        "LLL d, h:mm a",
      )
    : null;
  return (
    <div className="border-border bg-surface space-y-1.5 rounded-lg border p-3">
      <Side
        name={m.homeName}
        seed={m.homeSeed}
        score={m.homeScore}
        winner={m.winnerTeamId === m.homeTeamId}
        mine={!!m.homeTeamId && myTeamIds.includes(m.homeTeamId)}
      />
      <Side
        name={m.awayName}
        seed={m.awaySeed}
        score={m.awayScore}
        winner={m.winnerTeamId === m.awayTeamId}
        mine={!!m.awayTeamId && myTeamIds.includes(m.awayTeamId)}
      />
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span>
          {m.court ?? "Court TBD"}
          {when ? ` · ${when}` : ""}
        </span>
        {editable && m.homeTeamId && m.awayTeamId && (
          <Link
            href={`/matches/${m.id}`}
            className="text-claret inline-flex items-center gap-1 font-medium hover:underline"
          >
            <SquarePen className="size-3.5" />
            {m.status === "completed" ? "Edit score" : "Enter score"}
          </Link>
        )}
      </div>
    </div>
  );
}
