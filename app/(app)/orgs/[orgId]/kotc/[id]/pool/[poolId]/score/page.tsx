import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { loadPoolSession } from "@/lib/queries/kotc";
import { LiveScoreboard } from "@/components/kotc/live-scoreboard";

export default async function KotcScorePage({
  params,
}: {
  params: Promise<{ orgId: string; id: string; poolId: string }>;
}) {
  const { orgId, id, poolId } = await params;
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from("competitions")
    .select("id, org_id")
    .eq("id", id)
    .eq("type", "kotc")
    .single();
  if (!comp || comp.org_id !== orgId) notFound();

  const [session, { data: teams }] = await Promise.all([
    loadPoolSession(supabase, poolId),
    supabase.from("teams").select("id, name, players").eq("competition_id", id),
  ]);
  if (!session || session.competitionId !== id) notFound();

  const backHref = `/orgs/${orgId}/kotc/${id}`;
  const isDrop = session.dropRoundIndex != null;

  // Nothing left to score: a seeding pool needs 2+ pairs; an elimination/finals
  // pool stops once it's down to its final 3.
  const noRound = isDrop
    ? session.survivorCount <= 3
    : session.pairOrder.length < 2;
  if (noRound) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-display text-lg font-semibold">
          {isDrop ? "This pool is down to its final 3." : "Not enough pairs."}
        </p>
        <Link href={backHref} className="text-primary text-sm hover:underline">
          ← Back to the competition
        </Link>
      </div>
    );
  }

  const names: Record<string, string> = Object.fromEntries(
    (teams ?? []).map((t) => [t.id as string, t.name as string]),
  );
  const players: Record<string, string | null> = Object.fromEntries(
    (teams ?? []).map((t) => [
      t.id as string,
      (t.players as string | null) ?? null,
    ]),
  );

  const poolName = isDrop
    ? `${session.poolName} · Round ${(session.dropRoundIndex ?? 0) + 1}`
    : session.poolName;

  return (
    <LiveScoreboard
      poolId={poolId}
      poolName={poolName}
      pairOrder={session.pairOrder}
      names={names}
      players={players}
      config={session.config}
      roundMinutes={session.roundMinutes}
      initialEvents={session.events}
      roundStarts={session.roundStarts}
      backHref={backHref}
      roundLabel={
        isDrop ? `${session.survivorCount} in · drop lowest` : undefined
      }
      endLabel={isDrop ? "End round & drop" : undefined}
      completeMessage={
        isDrop
          ? "Round scored — the lowest pair was dropped. Head back to score the next round."
          : undefined
      }
    />
  );
}
