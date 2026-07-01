import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getKotcDetail,
  kotcDisplayStatus,
  type KotcDetail,
  type KotcPoolView,
  type KotcStageView,
} from "@/lib/queries/kotc";
import { rankKotcPool } from "@/lib/kotc/ranking";
import { AddPairForm } from "@/components/kotc/add-pair-form";
import { PoolBuilder } from "@/components/kotc/pool-builder";
import { ResultsCard } from "@/components/kotc/results-card";
import { EliminationPool } from "@/components/kotc/elimination-pool";
import { PublishToggle } from "@/components/kotc/publish-toggle";
import { StatusPill } from "@/components/kotc/status-pill";
import {
  ComposeFinalsButton,
  ConsolationCard,
} from "@/components/kotc/finals-controls";
import {
  ComputeSeedsButton,
  EliminationFlow,
  LockStageButton,
  RepoolFlow,
} from "@/components/kotc/stage-controls";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function KotcPage({
  params,
}: {
  params: Promise<{ orgId: string; id: string }>;
}) {
  const { orgId, id } = await params;
  const kotc = await getKotcDetail(id);
  if (!kotc || kotc.orgId !== orgId) notFound();

  const { settings, pairs } = kotc;

  // Flow state across the elimination → consolation → finals progression.
  const elimStage = kotc.stages.find((s) => s.kind === "elimination");
  const consoStage = kotc.stages.find((s) => s.kind === "consolation");
  const finalsStage = kotc.stages.find((s) => s.kind === "finals");

  const remainingOf = (pool: KotcPoolView) =>
    pool.pairs.filter((p) => p.eliminatedAtRound === null);
  const elimPools = elimStage?.pools ?? [];
  const elimAllDone =
    elimPools.length > 0 && elimPools.every((p) => remainingOf(p).length <= 3);
  const eliminated = elimPools.flatMap((p) =>
    p.pairs.filter((pp) => pp.eliminatedAtRound !== null),
  );
  const needsConsolation = eliminated.length >= 2;

  const consoLastRound = consoStage?.pools[0]?.rounds.at(-1);
  const consolationWinnerId = consoLastRound
    ? rankKotcPool(
        consoLastRound.results.map((r) => ({
          teamId: r.teamId,
          kingPoints: r.kingPoints,
          longestStreak: r.longestStreak,
          reachedSeq: r.reachedSeq,
        })),
      )[0]?.teamId
    : undefined;
  const consolationWinnerName =
    eliminated.find((p) => p.id === consolationWinnerId)?.name ?? null;
  const consolationDone = !!consolationWinnerId;

  const canCompose =
    elimAllDone && !finalsStage && (!needsConsolation || consolationDone);

  const setupText = [
    `${settings.pairsPerPool} pairs/pool`,
    `${settings.roundsPerSession}×${settings.roundMinutes} min rounds`,
    settings.pointCap ? `cap ${settings.pointCap}` : "time-only rounds",
    settings.seedMetric === "normalized_placement"
      ? "normalized seed"
      : "raw-points seed",
  ].join(" · ");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/orgs/${orgId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Back to organization
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
              {kotc.name}
            </h1>
            <StatusPill status={kotcDisplayStatus(kotc)} />
          </div>
          <PublishToggle
            competitionId={kotc.id}
            slug={kotc.slug}
            visibility={kotc.visibility}
          />
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          King of the Court · beach 2s · {setupText}
        </p>
      </div>

      {/* Roster */}
      <Card>
        <CardHeader>
          <CardTitle>
            Pairs{" "}
            <span className="text-muted-foreground text-sm font-normal tabular-nums">
              ({pairs.length})
            </span>
          </CardTitle>
          <CardDescription>
            Add every pair, then assign them into Round 1 pools below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <AddPairForm competitionId={kotc.id} />
          {pairs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pairs.map((p) => (
                <span
                  key={p.id}
                  className="border-border bg-surface rounded-md border px-2 py-1 text-xs"
                >
                  {p.name}
                  {p.players && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {p.players}
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seeding rounds */}
      {kotc.stages
        .filter((s) => s.kind === "seeding")
        .map((stage) => (
          <SeedingStage
            key={stage.id}
            stage={stage}
            roster={pairs}
            competitionId={kotc.id}
            orgId={orgId}
          />
        ))}

      {/* Elimination */}
      {elimStage && (
        <EliminationStage stage={elimStage} kotc={kotc} roster={pairs} />
      )}

      {/* Consolation + Finals */}
      {elimStage && elimAllDone && (
        <FinalsSection
          competitionId={kotc.id}
          eliminated={eliminated}
          needsConsolation={needsConsolation}
          consolationWinnerName={consolationWinnerName}
          canCompose={canCompose}
          finalsStage={finalsStage ?? null}
        />
      )}
    </div>
  );
}

function EliminationStage({
  stage,
  kotc,
  roster,
}: {
  stage: KotcStageView;
  kotc: KotcDetail;
  roster: { id: string; name: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{stage.name}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <ComputeSeedsButton competitionId={kotc.id} />
            {stage.pools.length > 0 && stage.status !== "in_progress" && (
              <LockStageButton stageId={stage.id} />
            )}
          </div>
        </div>
        <CardDescription>
          Compute the overall seed, draft the elimination pools (serpentine),
          lock, then play each pool: drop the lowest pair each round until 3
          remain and advance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {kotc.seeds.length > 0 && (
          <div className="border-border space-y-1 rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">Overall seed</p>
            <ol className="space-y-0.5">
              {kotc.seeds.map((s) => (
                <li
                  key={s.teamId}
                  className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 text-sm"
                >
                  <span className="text-muted-foreground tabular-nums">
                    {s.seedRank}
                  </span>
                  <span className="truncate">{s.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {s.seedScore?.toFixed(2)} · {s.totalPoints} pts
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {stage.pools.length === 0 ? (
          kotc.seeds.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Finish the seeding rounds and compute the seed first.
            </p>
          ) : (
            <EliminationFlow competitionId={kotc.id} roster={roster} />
          )
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stage.pools.map((pool) => (
              <EliminationPool
                key={`${pool.id}-${pool.rounds.length}`}
                pool={pool}
                kind="elimination"
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FinalsSection({
  competitionId,
  eliminated,
  needsConsolation,
  consolationWinnerName,
  canCompose,
  finalsStage,
}: {
  competitionId: string;
  eliminated: { id: string; name: string }[];
  needsConsolation: boolean;
  consolationWinnerName: string | null;
  canCompose: boolean;
  finalsStage: KotcStageView | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Consolation & Finals</CardTitle>
        <CardDescription>
          Every pair dropped in the pools plays one 15-minute consolation round
          for the last finals berth; the pool survivors plus that winner then
          run the same drop loop to decide the podium.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Consolation */}
        <div className="border-border space-y-2 rounded-lg border p-3">
          <p className="text-sm font-semibold">Consolation</p>
          {needsConsolation ? (
            consolationWinnerName ? (
              <p className="text-muted-foreground text-sm">
                Winner:{" "}
                <span className="text-foreground">{consolationWinnerName}</span>{" "}
                → into the finals.
              </p>
            ) : (
              <ConsolationCard
                competitionId={competitionId}
                eliminated={eliminated}
              />
            )
          ) : eliminated.length === 1 ? (
            <p className="text-muted-foreground text-sm">
              {eliminated[0].name} was the only pair eliminated — they take the
              berth automatically (no round needed).
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              No pairs were eliminated, so there is no consolation berth.
            </p>
          )}
        </div>

        {/* Finals */}
        {finalsStage && finalsStage.pools[0] ? (
          <EliminationPool
            key={`${finalsStage.pools[0].id}-${finalsStage.pools[0].rounds.length}`}
            pool={finalsStage.pools[0]}
            kind="finals"
          />
        ) : canCompose ? (
          <ComposeFinalsButton competitionId={competitionId} />
        ) : (
          <p className="text-muted-foreground text-sm">
            Finish the consolation round to assemble the finals.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SeedingStage({
  stage,
  roster,
  competitionId,
  orgId,
}: {
  stage: KotcStageView;
  roster: { id: string; name: string }[];
  competitionId: string;
  orgId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{stage.name}</CardTitle>
        <CardDescription>
          {stage.ordinal === 1
            ? "Assign pairs into pools, then enter each pool's King points — or score live."
            : "Generate a fair re-pool from the previous round, tweak, then enter results."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {stage.pools.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stage.pools.map((pool) => (
              <ResultsCard
                key={pool.id}
                pool={pool}
                scoreHref={`/orgs/${orgId}/kotc/${competitionId}/pool/${pool.id}/score`}
              />
            ))}
          </div>
        ) : roster.length < 2 ? (
          <p className="text-muted-foreground text-sm">
            Add at least 2 pairs before drawing pools.
          </p>
        ) : stage.ordinal === 1 ? (
          <PoolBuilder stageId={stage.id} roster={roster} />
        ) : stage.ordinal === 2 ? (
          <RepoolFlow competitionId={competitionId} roster={roster} />
        ) : (
          <PoolBuilder stageId={stage.id} roster={roster} />
        )}
      </CardContent>
    </Card>
  );
}
