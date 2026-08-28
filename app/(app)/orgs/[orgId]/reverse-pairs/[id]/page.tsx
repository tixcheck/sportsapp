import { notFound } from "next/navigation";

import { getReversePairs } from "@/lib/queries/reverse-pairs";
import { getUserOrgs } from "@/lib/auth/user";
import { GenerateReversePairsPanel } from "@/components/reverse-pairs/generate-panel";
import { PartnerMatrixCard } from "@/components/reverse-pairs/partner-matrix";
import { ReversePairsSchedule } from "@/components/reverse-pairs/schedule";
import { ReversePairsStandingsCard } from "@/components/reverse-pairs/standings";
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
        <ReversePairsStandingsCard
          pairs={detail.pairs}
          standings={detail.standings}
        />
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
