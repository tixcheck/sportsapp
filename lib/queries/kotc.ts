import { createClient } from "@/lib/supabase/server";
import type { KotcEvent } from "@/lib/kotc/engine";

export interface KotcSummary {
  id: string;
  name: string;
  slug: string;
  sport: string;
  status: string;
}

export interface KotcPairView {
  id: string;
  name: string;
  /** The two participants' first names, e.g. "Sam/Riley" (KotC roster only). */
  players?: string | null;
}

/** A pair as a member of a specific pool — carries its elimination status. */
export interface KotcPoolPairView extends KotcPairView {
  /** The drop-round at which this pair was eliminated; null = still in. */
  eliminatedAtRound: number | null;
}

export interface KotcResultView {
  teamId: string;
  name: string;
  players?: string | null;
  kingPoints: number;
  longestStreak: number | null;
  reachedSeq: number | null;
}

/** One drop-round of an elimination / consolation / finals pool. */
export interface KotcRoundView {
  roundIndex: number;
  minutes: number | null;
  results: KotcResultView[];
}

export interface KotcPoolView {
  id: string;
  name: string;
  sortOrder: number;
  status: string;
  pairs: KotcPoolPairView[];
  /** Seeding-stage manual entry (kotc_pool_results). */
  results: KotcResultView[];
  /** Elimination/consolation/finals drop-round history (kotc_rounds), in order. */
  rounds: KotcRoundView[];
}

export type KotcStageKind =
  | "seeding"
  | "elimination"
  | "consolation"
  | "finals";

export interface KotcStageView {
  id: string;
  ordinal: number;
  kind: KotcStageKind;
  name: string;
  status: string;
  pools: KotcPoolView[];
}

export interface KotcSeedView {
  teamId: string;
  name: string;
  players?: string | null;
  seedScore: number | null;
  totalPoints: number;
  seedRank: number | null;
}

export interface KotcDetail {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  sport: string;
  venue: string | null;
  status: string;
  visibility: string;
  settings: {
    pairsPerPool: number;
    roundsPerSession: number;
    roundMinutes: number;
    pointCap: number | null;
    seedingRoundCount: number;
    seedMetric: "normalized_placement" | "raw_points";
    location: string | null;
    notes: string | null;
  };
  pairs: KotcPairView[];
  stages: KotcStageView[];
  seeds: KotcSeedView[];
}

export async function getOrgKotc(orgId: string): Promise<KotcSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("competitions")
    .select("id, name, slug, sport, status")
    .eq("org_id", orgId)
    .eq("type", "kotc")
    .order("created_at", { ascending: false });
  return (data as KotcSummary[] | null) ?? [];
}

export async function getKotcDetail(
  competitionId: string,
): Promise<KotcDetail | null> {
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from("competitions")
    .select("id, org_id, name, slug, sport, venue, status, visibility")
    .eq("id", competitionId)
    .eq("type", "kotc")
    .single();
  if (!comp) return null;

  const [
    { data: settings },
    { data: teams },
    { data: stages },
    { data: pools },
    { data: pairs },
    { data: results },
    { data: rounds },
    { data: roundResults },
    { data: seeds },
  ] = await Promise.all([
    supabase
      .from("kotc_settings")
      .select("*")
      .eq("competition_id", competitionId)
      .single(),
    supabase
      .from("teams")
      .select("id, name, players")
      .eq("competition_id", competitionId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    supabase
      .from("kotc_stages")
      .select("id, ordinal, kind, name, status")
      .eq("competition_id", competitionId)
      .order("ordinal", { ascending: true }),
    supabase
      .from("kotc_pools")
      .select("id, stage_id, name, sort_order, status")
      .eq("competition_id", competitionId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("kotc_pool_pairs")
      .select("pool_id, team_id, queue_position, eliminated_at_round")
      .eq("competition_id", competitionId)
      .order("queue_position", { ascending: true }),
    supabase
      .from("kotc_pool_results")
      .select(
        "pool_id, team_id, king_points, longest_streak, reached_final_seq",
      )
      .eq("competition_id", competitionId),
    supabase
      .from("kotc_rounds")
      .select("id, pool_id, round_index, minutes")
      .eq("competition_id", competitionId)
      .order("round_index", { ascending: true }),
    supabase
      .from("kotc_round_results")
      .select("round_id, team_id, king_points, longest_streak")
      .eq("competition_id", competitionId),
    supabase
      .from("kotc_seeds")
      .select("team_id, seed_score, total_points, seed_rank")
      .eq("competition_id", competitionId)
      .order("seed_rank", { ascending: true }),
  ]);

  const nameOf = new Map<string, string>(
    (teams ?? []).map((t) => [t.id, t.name]),
  );
  const playersOf = new Map<string, string | null>(
    (teams ?? []).map((t) => [t.id, (t.players as string | null) ?? null]),
  );

  const stageViews: KotcStageView[] = (stages ?? []).map((st) => ({
    id: st.id,
    ordinal: st.ordinal,
    kind: st.kind as KotcStageKind,
    name: st.name,
    status: st.status,
    pools: (pools ?? [])
      .filter((p) => p.stage_id === st.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        sortOrder: p.sort_order,
        status: p.status,
        pairs: (pairs ?? [])
          .filter((pp) => pp.pool_id === p.id)
          .map((pp) => ({
            id: pp.team_id as string,
            name: nameOf.get(pp.team_id) ?? "—",
            players: playersOf.get(pp.team_id) ?? null,
            eliminatedAtRound:
              (pp.eliminated_at_round as number | null) ?? null,
          })),
        results: (results ?? [])
          .filter((r) => r.pool_id === p.id)
          .map((r) => ({
            teamId: r.team_id as string,
            name: nameOf.get(r.team_id) ?? "—",
            players: playersOf.get(r.team_id) ?? null,
            kingPoints: r.king_points,
            longestStreak: r.longest_streak,
            reachedSeq: r.reached_final_seq,
          })),
        rounds: (rounds ?? [])
          .filter((r) => r.pool_id === p.id)
          .map((r) => ({
            roundIndex: r.round_index as number,
            minutes: (r.minutes as number | null) ?? null,
            results: (roundResults ?? [])
              .filter((rr) => rr.round_id === r.id)
              .map((rr) => ({
                teamId: rr.team_id as string,
                name: nameOf.get(rr.team_id) ?? "—",
                players: playersOf.get(rr.team_id) ?? null,
                kingPoints: rr.king_points,
                longestStreak: rr.longest_streak,
                reachedSeq: null,
              })),
          })),
      })),
  }));

  return {
    id: comp.id,
    orgId: comp.org_id,
    name: comp.name,
    slug: comp.slug as string,
    sport: comp.sport as string,
    venue: (comp.venue as string | null) ?? null,
    status: comp.status,
    visibility: (comp.visibility as string) ?? "private",
    settings: {
      pairsPerPool: settings?.pairs_per_pool ?? 5,
      roundsPerSession: settings?.rounds_per_session ?? 3,
      roundMinutes: settings?.round_minutes ?? 15,
      pointCap: settings?.point_cap ?? null,
      seedingRoundCount: settings?.seeding_round_count ?? 2,
      seedMetric: (settings?.seed_metric ??
        "normalized_placement") as KotcDetail["settings"]["seedMetric"],
      location: (settings?.location as string | null) ?? null,
      notes: (settings?.notes as string | null) ?? null,
    },
    pairs: (teams ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      players: (t.players as string | null) ?? null,
    })),
    stages: stageViews,
    seeds: (seeds ?? []).map((s) => ({
      teamId: s.team_id as string,
      name: nameOf.get(s.team_id) ?? "—",
      players: playersOf.get(s.team_id) ?? null,
      seedScore: s.seed_score == null ? null : Number(s.seed_score),
      totalPoints: s.total_points,
      seedRank: s.seed_rank,
    })),
  };
}

/**
 * Public spectator view by slug. Resolves the competition (RLS returns it only
 * when public, or to a member/organizer), then reuses getKotcDetail. Returns null
 * for an unknown or non-public competition.
 */
/**
 * A live status derived from actual progress — the raw competitions.status stays
 * "draft" for KotC (no action advances it), so we compute a meaningful label:
 * "Completed" once the finals reach a podium, "Live" once any pool is scored,
 * else "Upcoming".
 */
export function kotcDisplayStatus(
  kotc: KotcDetail,
): "Completed" | "Live" | "Upcoming" {
  const finalsPool = kotc.stages.find((s) => s.kind === "finals")?.pools[0];
  if (finalsPool) {
    const remaining = finalsPool.pairs.filter(
      (p) => p.eliminatedAtRound === null,
    ).length;
    if (remaining <= 3 && finalsPool.pairs.length > remaining)
      return "Completed";
  }
  const live = kotc.stages.some((s) =>
    s.pools.some((p) => p.results.length > 0 || p.rounds.length > 0),
  );
  return live ? "Live" : "Upcoming";
}

/**
 * The rally log per pool, resolved to engine events (for the read-only score
 * sheet). Only live-scored pools have entries; manual entry records no rallies.
 */
export async function getKotcPoolEvents(
  competitionId: string,
): Promise<Record<string, KotcEvent[]>> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("kotc_events")
    .select("pool_id, seq, type, point_awarded")
    .eq("competition_id", competitionId)
    .order("seq", { ascending: true });

  const byPool: Record<string, KotcEvent[]> = {};
  for (const r of rows ?? []) {
    const pid = r.pool_id as string;
    byPool[pid] ??= [];
    if (r.type === "rally") {
      byPool[pid].push({
        type: "rally",
        winnerSide: r.point_awarded ? "king" : "challenger",
      });
    } else if (r.type === "serve_error") {
      byPool[pid].push({ type: "serve_error" });
    } else if (r.type === "round_end") {
      byPool[pid].push({ type: "round_end" });
    } else if (r.type === "void") {
      byPool[pid].push({ type: "void" });
    }
  }
  return byPool;
}

export async function getPublicKotcDetail(
  slug: string,
): Promise<KotcDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("competitions")
    .select("id")
    .eq("slug", slug)
    .eq("type", "kotc")
    .maybeSingle();
  if (!data) return null;
  return getKotcDetail(data.id as string);
}
