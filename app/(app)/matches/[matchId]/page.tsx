import { showEntryForm } from "@/lib/scoring/entry-role";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getMatchForEntry } from "@/lib/queries/my-matches";
import { canClearResult } from "@/lib/scoring/lock";
import { defaultedLabel } from "@/lib/scoring/defaults";
import { scorekeeperReturnUrl } from "@/lib/scoring/return-url";
import { ScoreEntryForm } from "@/components/scoring/score-entry-form";
import { ClearResultButton } from "@/components/scoring/clear-result-button";
import { DoubleDefaultButton } from "@/components/scoring/double-default-button";
import { ConfirmBar } from "@/components/scoring/confirm-bar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function MatchEntryPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const match = await getMatchForEntry(matchId);
  if (!match) notFound();

  // Admins and scorekeepers can always enter/edit. Captains/refs see the
  // form only before the score is final and when they're not the confirmer.
  const showEntry = showEntryForm(match.role, {
    canEnter: match.canEnter,
    final: match.state === "final",
    awaitingMyConfirmation: match.canConfirm,
  });

  // Organizers can undo a result that's been entered (or a match left mid-entry)
  // — but not for playoff matches, where it would desync the bracket.
  const hasResult = match.sets.length > 0 || match.status !== "scheduled";
  // Both teams defaulting has no winner, so a playoff game can't end that way.
  const showDoubleDefault = match.isAdmin && match.bracketPosition === null;
  const showClear =
    hasResult &&
    canClearResult({
      isAdmin: match.isAdmin,
      bracketPosition: match.bracketPosition,
    }).ok;

  return (
    <div className="mx-auto max-w-md">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {match.isAdmin && (
          <Link
            href={`/orgs/${match.orgId}/${match.competitionType}s/${match.competitionId}#schedule`}
            className="text-muted-foreground hover:underline"
          >
            ← Back to schedule
          </Link>
        )}
        {match.role === "scorekeeper" && (
          <Link
            href={scorekeeperReturnUrl(
              match.competitionId,
              match,
              match.timezone,
            )}
            className="text-muted-foreground hover:underline"
          >
            ← Back to all games
          </Link>
        )}
        <Link
          href="/my-matches"
          className="text-muted-foreground hover:underline"
        >
          {match.isAdmin ? "My matches" : "← My matches"}
        </Link>
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>
            {match.homeTeamName} vs {match.awayTeamName}
          </CardTitle>
          <CardDescription>
            {match.competitionName}
            {match.refTeamName ? ` · Ref: ${match.refTeamName}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {match.isAdmin && match.isAbnormal && (
            <span className="bg-claret-tint text-claret-deep inline-block rounded-[4px] px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
              Abnormal result
            </span>
          )}
          {match.doubleDefault ? (
            <p className="bg-muted rounded-lg px-3 py-2 text-sm">
              Both teams defaulted: a loss for each, no points either way.
            </p>
          ) : showEntry ? (
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
            />
          ) : (
            <>
              {match.futureLocked && (
                <p className="text-muted-foreground text-sm">
                  This game hasn&apos;t been played yet — scores open on game
                  day.
                </p>
              )}
              {match.sets.length > 0 ? (
                <ul className="divide-border divide-y text-sm">
                  {match.sets.map((s, i) => (
                    <li key={i} className="flex justify-between py-2">
                      <span className="text-muted-foreground">Set {i + 1}</span>
                      <span className="font-display tabular-nums">
                        {s.home}–{s.away}
                        {s.defaultedBy && (
                          <span className="text-muted-foreground ml-2 font-sans text-xs">
                            {defaultedLabel(
                              s.defaultedBy,
                              match.homeTeamName,
                              match.awayTeamName,
                            )}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No score entered yet.
                </p>
              )}

              {match.canConfirm && (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-sm">
                    Confirm this score, or dispute it if it&apos;s wrong.
                  </p>
                  <ConfirmBar matchId={match.id} />
                </div>
              )}
              {match.state === "final" && (
                <p className="text-muted-foreground text-sm">
                  This score is final.
                </p>
              )}
            </>
          )}
          {(showDoubleDefault || showClear) && (
            <div className="border-border space-y-2 border-t pt-4">
              {showDoubleDefault && (
                <DoubleDefaultButton
                  matchId={match.id}
                  on={match.doubleDefault}
                />
              )}
              {showClear && !match.doubleDefault && (
                <ClearResultButton matchId={match.id} />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
