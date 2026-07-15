import Link from "next/link";
import { notFound } from "next/navigation";

import { getMatchForEntry } from "@/lib/queries/my-matches";
import { canClearResult } from "@/lib/scoring/lock";
import { ScoreEntryForm } from "@/components/scoring/score-entry-form";
import { ClearResultButton } from "@/components/scoring/clear-result-button";
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

  // Admins can always enter/edit (organizer override). Captains/refs see the
  // form only before the score is final and when they're not the confirmer.
  const showEntry =
    match.canEnter &&
    (match.isAdmin || (match.state !== "final" && !match.canConfirm));

  // Organizers can undo a result that's been entered (or a match left mid-entry)
  // — but not for playoff matches, where it would desync the bracket.
  const hasResult = match.sets.length > 0 || match.status !== "scheduled";
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
          {showEntry ? (
            <ScoreEntryForm
              matchId={match.id}
              homeTeamName={match.homeTeamName}
              awayTeamName={match.awayTeamName}
              matchFormat={match.matchFormat}
              initialSets={match.sets}
              requireConfirmation={match.requireConfirmation}
              isAdmin={match.isAdmin}
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
          {showClear && (
            <div className="border-border border-t pt-4">
              <ClearResultButton matchId={match.id} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
