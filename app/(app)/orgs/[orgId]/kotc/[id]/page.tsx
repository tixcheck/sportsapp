import Link from "next/link";
import { notFound } from "next/navigation";

import { getKotcDetail, type KotcStageView } from "@/lib/queries/kotc";
import { AddPairForm } from "@/components/kotc/add-pair-form";
import { PoolBuilder } from "@/components/kotc/pool-builder";
import { ResultsCard } from "@/components/kotc/results-card";
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
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
            {kotc.name}
          </h1>
          <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium capitalize">
            {kotc.status}
          </span>
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
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stages */}
      {kotc.stages.map((stage) =>
        stage.kind === "seeding" ? (
          <SeedingStage
            key={stage.id}
            stage={stage}
            roster={pairs}
            competitionId={kotc.id}
          />
        ) : (
          <Card key={stage.id}>
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
                Compute the overall seed from the seeding rounds, draft the
                elimination pools (serpentine), tweak, then lock and play.
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
                  <EliminationFlow competitionId={kotc.id} roster={pairs} />
                )
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {stage.pools.map((pool) => (
                    <ResultsCard key={pool.id} pool={pool} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ),
      )}
    </div>
  );
}

function SeedingStage({
  stage,
  roster,
  competitionId,
}: {
  stage: KotcStageView;
  roster: { id: string; name: string }[];
  competitionId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{stage.name}</CardTitle>
        <CardDescription>
          {stage.ordinal === 1
            ? "Assign pairs into pools, then enter each pool's King points."
            : "Generate a fair re-pool from the previous round, tweak, then enter results."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {stage.pools.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stage.pools.map((pool) => (
              <ResultsCard key={pool.id} pool={pool} />
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
