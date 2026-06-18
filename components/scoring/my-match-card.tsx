"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { toast } from "sonner";

import {
  confirmScoreAction,
  disputeScoreAction,
} from "@/server/actions/scores";
import type { MyMatch } from "@/lib/queries/my-matches";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const STATE_PILL: Record<
  MyMatch["state"],
  { label: string; className: string }
> = {
  none: { label: "Scheduled", className: "bg-muted text-muted-foreground" },
  pending: {
    label: "Needs confirmation",
    className: "bg-gold-300/40 text-coral-900",
  },
  disputed: {
    label: "Disputed",
    className: "bg-destructive/10 text-destructive",
  },
  final: { label: "Final", className: "bg-muted text-muted-foreground" },
};

export function MyMatchCard({ match }: { match: MyMatch }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const homeWon = match.sets.filter((s) => s.home > s.away).length;
  const awayWon = match.sets.filter((s) => s.away > s.home).length;
  const hasScore = match.sets.length > 0;
  // Win/loss coloring only once the match is final and actually decided.
  const decided = match.state === "final" && hasScore && homeWon !== awayWon;
  const homeResult = decided ? (homeWon > awayWon ? "win" : "loss") : null;
  const awayResult = decided ? (awayWon > homeWon ? "win" : "loss") : null;
  const time = match.scheduledAt
    ? DateTime.fromISO(match.scheduledAt, { zone: match.timezone }).toFormat(
        "h:mm a",
      )
    : null;
  const pill = STATE_PILL[match.state];

  function act(fn: typeof confirmScoreAction, label: string) {
    startTransition(async () => {
      const result = await fn(match.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(label);
      router.refresh();
    });
  }

  return (
    <div className="border-border bg-surface rounded-lg border p-4 shadow-sm">
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span className="truncate">{match.competitionName}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            pill.className,
          )}
        >
          {pill.label}
        </span>
      </div>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Row
            name={match.homeTeamName}
            won={homeWon}
            top={homeWon >= awayWon}
            show={hasScore}
            result={homeResult}
          />
          <Row
            name={match.awayTeamName}
            won={awayWon}
            top={awayWon >= homeWon}
            show={hasScore}
            result={awayResult}
          />
        </div>
        {hasScore ? (
          <p className="text-muted-foreground shrink-0 text-right text-xs tabular-nums">
            {match.sets.map((s, i) => (
              <span key={i} className="ml-1">
                {s.home}–{s.away}
              </span>
            ))}
          </p>
        ) : (
          time && (
            <p className="font-display shrink-0 text-lg tabular-nums">{time}</p>
          )
        )}
      </div>

      <div className="text-muted-foreground mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="truncate">
          {match.round ? `Round ${match.round}` : match.competitionType}
          {match.court ? ` · ${match.court}` : ""}
          {match.role === "ref" ? " · you ref" : ""}
        </span>
        <div className="flex items-center gap-2">
          {match.canConfirm ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => act(disputeScoreAction, "Score disputed.")}
              >
                Dispute
              </Button>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => act(confirmScoreAction, "Score confirmed.")}
              >
                Confirm
              </Button>
            </>
          ) : match.state === "final" ? null : match.canEnter ? (
            <Button
              asChild
              size="sm"
              variant={hasScore ? "outline" : "default"}
            >
              <Link href={`/matches/${match.id}`}>
                {match.state === "pending" ? "View" : "Enter score"}
              </Link>
            </Button>
          ) : match.state === "pending" ? (
            <span>Awaiting confirmation</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({
  name,
  won,
  top,
  show,
  result,
}: {
  name: string;
  won: number;
  top: boolean;
  show: boolean;
  result: "win" | "loss" | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "truncate font-medium",
          result === "win" && "text-win",
          result === "loss" && "text-loss",
        )}
      >
        {name}
      </span>
      {show && (
        <span
          className={cn(
            "font-display text-lg tabular-nums",
            result === "win"
              ? "text-win"
              : result === "loss"
                ? "text-loss"
                : top
                  ? "text-coral-700"
                  : "text-text-3",
          )}
        >
          {won}
        </span>
      )}
    </div>
  );
}
