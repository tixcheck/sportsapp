import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { LiveScoreboard } from "@/components/kotc/live-scoreboard";
import type { KotcConfig, KotcEvent } from "@/lib/kotc/engine";

export default async function KotcScorePage({
  params,
}: {
  params: Promise<{ orgId: string; id: string; poolId: string }>;
}) {
  const { orgId, id, poolId } = await params;
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from("competitions")
    .select("id, org_id, name")
    .eq("id", id)
    .eq("type", "kotc")
    .single();
  if (!comp || comp.org_id !== orgId) notFound();

  const { data: pool } = await supabase
    .from("kotc_pools")
    .select("id, name, competition_id")
    .eq("id", poolId)
    .single();
  if (!pool || pool.competition_id !== id) notFound();

  const [{ data: pairs }, { data: settings }, { data: rows }, { data: teams }] =
    await Promise.all([
      supabase
        .from("kotc_pool_pairs")
        .select("team_id, queue_position")
        .eq("pool_id", poolId)
        .order("queue_position", { ascending: true }),
      supabase
        .from("kotc_settings")
        .select("rounds_per_session, point_cap, round_minutes")
        .eq("competition_id", id)
        .single(),
      supabase
        .from("kotc_events")
        .select("seq, type, point_awarded, round_index, occurred_at")
        .eq("pool_id", poolId)
        .order("seq", { ascending: true }),
      supabase
        .from("teams")
        .select("id, name, players")
        .eq("competition_id", id),
    ]);

  const pairOrder = (pairs ?? []).map((p) => p.team_id as string);
  if (pairOrder.length < 2) notFound();

  const names: Record<string, string> = Object.fromEntries(
    (teams ?? []).map((t) => [t.id as string, t.name as string]),
  );
  const players: Record<string, string | null> = Object.fromEntries(
    (teams ?? []).map((t) => [
      t.id as string,
      (t.players as string | null) ?? null,
    ]),
  );

  const config: KotcConfig = {
    roundsPerSession: settings?.rounds_per_session ?? 3,
    pointCap: settings?.point_cap ?? null,
  };
  const roundMinutes = settings?.round_minutes ?? 15;

  const initialEvents: KotcEvent[] = [];
  // round_index → ISO start time of that round's clock (round_start markers).
  const roundStarts: Record<number, string> = {};
  for (const r of rows ?? []) {
    if (r.type === "rally") {
      initialEvents.push({
        type: "rally",
        winnerSide: r.point_awarded ? "king" : "challenger",
      });
    } else if (r.type === "round_end") {
      initialEvents.push({ type: "round_end" });
    } else if (r.type === "void") {
      initialEvents.push({ type: "void" });
    } else if (r.type === "round_start") {
      roundStarts[r.round_index as number] = r.occurred_at as string;
    }
  }

  return (
    <LiveScoreboard
      poolId={poolId}
      poolName={pool.name as string}
      pairOrder={pairOrder}
      names={names}
      players={players}
      config={config}
      roundMinutes={roundMinutes}
      initialEvents={initialEvents}
      roundStarts={roundStarts}
      backHref={`/orgs/${orgId}/kotc/${id}`}
    />
  );
}
