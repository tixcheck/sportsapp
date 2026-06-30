"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

import {
  computeKotcSeedsAction,
  lockKotcStageAction,
  repoolRound2Action,
  seedEliminationAction,
  type KotcPoolProposal,
} from "@/server/actions/kotc";
import type { KotcPairView } from "@/lib/queries/kotc";
import { Button } from "@/components/ui/button";
import { PoolBuilder } from "@/components/kotc/pool-builder";

export function ComputeSeedsButton({
  competitionId,
}: {
  competitionId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await computeKotcSeedsAction(competitionId);
          if ("error" in res) {
            toast.error(res.error);
            return;
          }
          toast.success(`Seeded ${res.seedCount} pairs.`);
          router.refresh();
        })
      }
    >
      <Sparkles /> {pending ? "Computing…" : "Compute seed"}
    </Button>
  );
}

export function LockStageButton({ stageId }: { stageId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await lockKotcStageAction(stageId);
          if ("error" in res) {
            toast.error(res.error);
            return;
          }
          toast.success("Stage locked — play on.");
          router.refresh();
        })
      }
    >
      <Lock /> {pending ? "Locking…" : "Lock pools"}
    </Button>
  );
}

/** Generate a fair Round-2 re-pool proposal, then let the organizer tweak + save. */
export function RepoolFlow({
  competitionId,
  roster,
}: {
  competitionId: string;
  roster: KotcPairView[];
}) {
  const [pending, start] = useTransition();
  const [proposal, setProposal] = useState<KotcPoolProposal | null>(null);

  if (proposal) {
    return (
      <PoolBuilder
        stageId={proposal.stageId}
        roster={roster}
        initialPools={proposal.pools}
        note={
          proposal.repeats === 0
            ? "Balanced re-pool with no rematches — tweak if you like, then save."
            : `Balanced re-pool, ${proposal.repeats} unavoidable rematch${proposal.repeats === 1 ? "" : "es"} — tweak if you like, then save.`
        }
      />
    );
  }

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await repoolRound2Action({ competitionId });
          if ("error" in res) {
            toast.error(res.error);
            return;
          }
          setProposal(res);
        })
      }
    >
      <Wand2 /> {pending ? "Building…" : "Generate fair re-pool"}
    </Button>
  );
}

/** Draft the elimination pools from the overall seed, then tweak + save. */
export function EliminationFlow({
  competitionId,
  roster,
}: {
  competitionId: string;
  roster: KotcPairView[];
}) {
  const [pending, start] = useTransition();
  const [proposal, setProposal] = useState<KotcPoolProposal | null>(null);

  if (proposal) {
    return (
      <PoolBuilder
        stageId={proposal.stageId}
        roster={roster}
        initialPools={proposal.pools}
        note="Seeded by the overall standings (serpentine) — tweak if you like, then save and lock."
      />
    );
  }

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await seedEliminationAction({ competitionId });
          if ("error" in res) {
            toast.error(res.error);
            return;
          }
          setProposal(res);
        })
      }
    >
      <Wand2 /> {pending ? "Drafting…" : "Draft elimination pools"}
    </Button>
  );
}
