import { notFound } from "next/navigation";

import { getReversePairs } from "@/lib/queries/reverse-pairs";
import { getUserOrgs } from "@/lib/auth/user";
import { GenerateReversePairsPanel } from "@/components/reverse-pairs/generate-panel";
import { PartnerMatrixCard } from "@/components/reverse-pairs/partner-matrix";
import { ReversePairsSchedule } from "@/components/reverse-pairs/schedule";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default async function ReversePairsPage({
  params,
}: {
  params: Promise<{ orgId: string; id: string }>;
}) {
  const { orgId, id } = await params;
  const detail = await getReversePairs(id);
  if (!detail || detail.orgId !== orgId) notFound();

  const orgs = await getUserOrgs();
  const role = orgs.find((o) => o.id === orgId)?.role;
  const isAdmin = role === "owner" || role === "admin";

  const byId = new Map(detail.pairs.map((p) => [p.id, p]));
  const played = detail.games.filter((g) => g.scoreA !== null).length;
  const counts = [...detail.gamesPerPair.values()];
  const minGames = counts.length ? Math.min(...counts) : 0;
  const maxGames = counts.length ? Math.max(...counts) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
          {detail.name}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Reverse Pairs · {detail.pairs.length} pairs · {detail.settings.courts}{" "}
          courts
          {detail.games.length > 0 && (
            <>
              {" "}
              ·{" "}
              {minGames === maxGames
                ? `${minGames} games each`
                : `${minGames}–${maxGames} games each`}
            </>
          )}
          {played > 0 && ` · ${played} of ${detail.games.length} scored`}
        </p>
      </div>

      {isAdmin && (
        <GenerateReversePairsPanel
          competitionId={detail.competitionId}
          competitionName={detail.name}
          pairCount={detail.pairs.length}
          suggestions={detail.suggestions}
          initial={detail.settings}
          hasSchedule={detail.games.length > 0}
        />
      )}

      {detail.games.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Standings</CardTitle>
            <CardDescription>
              Ranked on total point differential — every pair on a side takes
              the margin, so a 25–23 loss costs far less than a 25–12 one.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-ink-3 border-rule border-b text-left text-xs">
                  <th className="p-2 font-medium">#</th>
                  <th className="p-2 font-medium">Pair</th>
                  <th className="p-2 text-right font-medium">GP</th>
                  <th className="p-2 text-right font-medium">W</th>
                  <th className="p-2 text-right font-medium">L</th>
                  <th className="p-2 text-right font-medium">PF</th>
                  <th className="p-2 text-right font-medium">PA</th>
                  <th className="p-2 text-right font-medium">Diff</th>
                </tr>
              </thead>
              <tbody>
                {detail.standings.map((s) => (
                  <tr key={s.teamId} className="border-rule/60 border-b">
                    <td className="text-ink-3 p-2">{s.rank}</td>
                    <td className="p-2 font-medium">
                      {byId.get(s.teamId)?.name ?? "—"}
                    </td>
                    <td className="p-2 text-right">{s.played}</td>
                    <td className="p-2 text-right">{s.won}</td>
                    <td className="p-2 text-right">{s.lost}</td>
                    <td className="text-ink-3 p-2 text-right">{s.pointsFor}</td>
                    <td className="text-ink-3 p-2 text-right">
                      {s.pointsAgainst}
                    </td>
                    <td
                      className={cn(
                        "p-2 text-right font-semibold",
                        s.differential > 0 && "text-pine",
                        s.differential < 0 && "text-claret",
                      )}
                    >
                      {s.differential > 0
                        ? `+${s.differential}`
                        : s.differential}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <PartnerMatrixCard pairs={detail.pairs} matrix={detail.matrix} />

      <ReversePairsSchedule
        games={detail.games}
        byes={detail.byes}
        canEnterScores={isAdmin}
      />
    </div>
  );
}
