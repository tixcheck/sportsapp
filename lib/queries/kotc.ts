import { createClient } from "@/lib/supabase/server";

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
}

export interface KotcResultView {
  teamId: string;
  name: string;
  kingPoints: number;
  longestStreak: number | null;
  reachedSeq: number | null;
}

export interface KotcPoolView {
  id: string;
  name: string;
  sortOrder: number;
  status: string;
  pairs: KotcPairView[];
  results: KotcResultView[];
}

export interface KotcStageView {
  id: string;
  ordinal: number;
  kind: "seeding" | "elimination";
  name: string;
  status: string;
  pools: KotcPoolView[];
}

export interface KotcSeedView {
  teamId: string;
  name: string;
  seedScore: number | null;
  totalPoints: number;
  seedRank: number | null;
}

export interface KotcDetail {
  id: string;
  orgId: string;
  name: string;
  status: string;
  settings: {
    pairsPerPool: number;
    roundsPerSession: number;
    roundMinutes: number;
    pointCap: number | null;
    seedingRoundCount: number;
    seedMetric: "normalized_placement" | "raw_points";
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
    .select("id, org_id, name, status")
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
    { data: seeds },
  ] = await Promise.all([
    supabase
      .from("kotc_settings")
      .select("*")
      .eq("competition_id", competitionId)
      .single(),
    supabase
      .from("teams")
      .select("id, name")
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
      .select("pool_id, team_id, queue_position")
      .eq("competition_id", competitionId)
      .order("queue_position", { ascending: true }),
    supabase
      .from("kotc_pool_results")
      .select(
        "pool_id, team_id, king_points, longest_streak, reached_final_seq",
      )
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

  const stageViews: KotcStageView[] = (stages ?? []).map((st) => ({
    id: st.id,
    ordinal: st.ordinal,
    kind: st.kind as "seeding" | "elimination",
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
          })),
        results: (results ?? [])
          .filter((r) => r.pool_id === p.id)
          .map((r) => ({
            teamId: r.team_id as string,
            name: nameOf.get(r.team_id) ?? "—",
            kingPoints: r.king_points,
            longestStreak: r.longest_streak,
            reachedSeq: r.reached_final_seq,
          })),
      })),
  }));

  return {
    id: comp.id,
    orgId: comp.org_id,
    name: comp.name,
    status: comp.status,
    settings: {
      pairsPerPool: settings?.pairs_per_pool ?? 5,
      roundsPerSession: settings?.rounds_per_session ?? 3,
      roundMinutes: settings?.round_minutes ?? 15,
      pointCap: settings?.point_cap ?? null,
      seedingRoundCount: settings?.seeding_round_count ?? 2,
      seedMetric: (settings?.seed_metric ??
        "normalized_placement") as KotcDetail["settings"]["seedMetric"],
    },
    pairs: (teams ?? []).map((t) => ({ id: t.id, name: t.name })),
    stages: stageViews,
    seeds: (seeds ?? []).map((s) => ({
      teamId: s.team_id as string,
      name: nameOf.get(s.team_id) ?? "—",
      seedScore: s.seed_score == null ? null : Number(s.seed_score),
      totalPoints: s.total_points,
      seedRank: s.seed_rank,
    })),
  };
}
