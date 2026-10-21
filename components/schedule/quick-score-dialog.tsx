"use client";

import { useState } from "react";
import Link from "next/link";
import { SquarePen } from "lucide-react";

import type { MatchEntryData } from "@/lib/queries/my-matches";
import { loadQuickScoreAction } from "@/server/actions/scores";
import { ScoreEntryForm } from "@/components/scoring/score-entry-form";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * "Enter score" on the organizer's schedule, without leaving it: the score
 * form opens over the schedule, and saving closes it with the card updated
 * where it was. Clearing a result and double defaults stay on the game page.
 */
export function QuickScoreDialog({
  matchId,
  completed,
}: {
  matchId: string;
  completed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [match, setMatch] = useState<MatchEntryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setMatch(null);
    setError(null);
    const result = await loadQuickScoreAction(matchId);
    if ("error" in result) setError(result.error);
    else setMatch(result.match);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-claret inline-flex shrink-0 items-center gap-1 font-medium whitespace-nowrap hover:underline"
        >
          <SquarePen className="size-3.5" />
          {completed ? "Edit score" : "Enter score"}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {match
              ? `${match.homeTeamName} vs ${match.awayTeamName}`
              : "Enter score"}
          </DialogTitle>
          <DialogDescription>
            {match?.refTeamName ? `Ref: ${match.refTeamName} · ` : ""}
            <Link href={`/matches/${matchId}`} className="underline">
              Open the game page
            </Link>{" "}
            to clear a result or record a double default.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : !match ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : match.doubleDefault ? (
          <p className="bg-muted rounded-lg px-3 py-2 text-sm">
            Both teams defaulted: a loss for each, no points either way.
          </p>
        ) : (
          <ScoreEntryForm
            matchId={match.id}
            homeTeamName={match.homeTeamName}
            awayTeamName={match.awayTeamName}
            matchFormat={match.matchFormat}
            initialSets={match.sets}
            requireConfirmation={match.requireConfirmation}
            isAdmin={match.isAdmin}
            canDefault={match.role !== "player"}
            sport={match.sport}
            onSaved={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
