import { createClient } from "@/lib/supabase/server";
import type { LadderUnit } from "@/lib/validations/ladder";
import { typedTierOrder } from "@/lib/scheduler/ladder-results";
import { roundWeeksOf } from "@/lib/scheduler/bvl-round";

export type LadderDraw = "generated" | "pod_grid" | "bvl_round";

export interface LadderTierView {
  divisionId: string;
  name: string;
  tierOrder: number;
  teams: {
    teamId: string;
    name: string;
    position: number;
    /** Typed finishing place this week, 1 = won the gym. */
    resultRank: number | null;
    resultPoints: number | null;
  }[];
  /** Every team in the tier has a typed finishing place this week. */
  standingsEntered: boolean;
}

export interface LadderState {
  enabled: boolean;
  /** Computed nights, or Scarborough's pinned grids (migration 0138). */
  draw: LadderDraw;
  unit: LadderUnit;
  target: number;
  /** One count per boundary, top-down. Length is (tiers - 1). */
  swaps: number[];
  tiers: { divisionId: string; name: string; tierOrder: number }[];
  /** Highest week with placements. 0 = the ladder hasn't started. */
  currentWeek: number;
  /** Tiers with their rosters for `currentWeek`. Empty before the start. */
  standingsThisWeek: LadderTierView[];
  /**
   * Whether the week can be locked: every tier has typed standings or, for the
   * tiers that don't, every one of their games has a result.
   */
  currentWeekComplete: boolean;
  /** Games drawn for the current week (0 = drawn but not yet generated). */
  currentWeekGames: number;
  /**
   * The weeks of the round `currentWeek` belongs to — just `[currentWeek]`
   * for a weekly ladder, two weeks for BVL (0157). Games and completeness
   * above count the whole round, since the round is what gets drawn and
   * locked.
   */
  roundWeeks: number[];
  /** 1-based round number of `currentWeek` (round 1 before the start). */
  round: number;
}

const SETTLED = new Set(["completed", "forfeit", "cancelled"]);

/**
 * Everything the organizer's Ladder panel needs in one read: the config, the
 * tier list, this week's rosters, and whether the week is finished.
 *
 * Returns null when the competition has no league settings (i.e. it isn't a
 * league). `enabled: false` is a normal state — the config exists but the
 * organizer hasn't switched the format on.
 */
export async function getLadderState(
  competitionId: string,
): Promise<LadderState | null> {
  const supabase = await createClient();

  const [{ data: settings }, { data: divisions }] = await Promise.all([
    supabase
      .from("league_settings")
      .select(
        "ladder_enabled, ladder_draw, ladder_unit, ladder_target, ladder_swaps, ladder_round_weeks",
      )
      .eq("competition_id", competitionId)
      .maybeSingle(),
    supabase
      .from("divisions")
      .select("id, name, tier_order")
      .eq("competition_id", competitionId)
      .order("tier_order", { ascending: true }),
  ]);
  if (!settings) return null;

  const tiers = (divisions ?? []).map((d) => ({
    divisionId: d.id as string,
    name: d.name as string,
    tierOrder: d.tier_order as number,
  }));

  const { data: placements } = await supabase
    .from("ladder_placements")
    .select("team_id, division_id, week, position, result_rank, result_points")
    .eq("competition_id", competitionId)
    .order("week", { ascending: false })
    .order("position", { ascending: true });

  const currentWeek = (placements ?? []).reduce(
    (max, p) => Math.max(max, p.week as number),
    0,
  );

  let standingsThisWeek: LadderTierView[] = [];
  let currentWeekComplete = false;
  let currentWeekGames = 0;
  const roundLength = (settings.ladder_round_weeks as number | null) ?? 1;
  const roundWeeks = roundWeeksOf(Math.max(currentWeek, 1), roundLength);

  if (currentWeek > 0) {
    const thisWeek = (placements ?? []).filter((p) => p.week === currentWeek);
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name")
      .eq("competition_id", competitionId);
    const teamName = new Map(
      (teams ?? []).map((t) => [t.id as string, t.name as string]),
    );

    standingsThisWeek = tiers.map((t) => {
      const rows = thisWeek
        .filter((p) => p.division_id === t.divisionId)
        .sort((a, b) => (a.position as number) - (b.position as number))
        .map((p) => ({
          teamId: p.team_id as string,
          name: teamName.get(p.team_id as string) ?? "—",
          position: p.position as number,
          resultRank: (p.result_rank as number | null) ?? null,
          resultPoints: (p.result_points as number | null) ?? null,
        }));
      const order = typedTierOrder(
        rows.map((r) => r.teamId),
        rows.map((r) => ({
          teamId: r.teamId,
          rank: r.resultRank,
          points: r.resultPoints,
        })),
      );
      return {
        ...t,
        teams: rows,
        standingsEntered: rows.length > 0 && order.status === "complete",
      };
    });

    const { data: weekMatches } = await supabase
      .from("matches")
      .select("id, status, division_id")
      .eq("competition_id", competitionId)
      .in("round", roundWeeks);
    currentWeekGames = (weekMatches ?? []).length;

    // Mirrors the lock: a typed tier needs no scores; every other game does.
    const typedTiers = new Set(
      standingsThisWeek
        .filter((t) => t.standingsEntered)
        .map((t) => t.divisionId),
    );
    const allTyped = standingsThisWeek
      .filter((t) => t.teams.length > 0)
      .every((t) => t.standingsEntered);
    const needScores = (weekMatches ?? []).filter(
      (m) => m.division_id == null || !typedTiers.has(m.division_id as string),
    );
    currentWeekComplete =
      allTyped ||
      (needScores.length > 0 &&
        needScores.every((m) => SETTLED.has(m.status as string)));
  }

  return {
    enabled: settings.ladder_enabled === true,
    draw:
      settings.ladder_draw === "pod_grid" ||
      settings.ladder_draw === "bvl_round"
        ? settings.ladder_draw
        : "generated",
    unit: (settings.ladder_unit as LadderUnit) ?? "sets",
    target: (settings.ladder_target as number) ?? 6,
    swaps: (settings.ladder_swaps as number[] | null) ?? [],
    tiers,
    currentWeek,
    standingsThisWeek,
    currentWeekComplete,
    currentWeekGames,
    roundWeeks,
    round: Math.ceil(roundWeeks[0] / roundLength),
  };
}

export interface LadderHistoryRow {
  teamId: string;
  teamName: string;
  /** Tier name per week, oldest first. */
  byWeek: { week: number; tierName: string }[];
}

/** Each team's tier week by week — the season's story for the ladder view. */
export async function getLadderHistory(
  competitionId: string,
): Promise<LadderHistoryRow[]> {
  const supabase = await createClient();
  const [{ data: placements }, { data: teams }, { data: divisions }] =
    await Promise.all([
      supabase
        .from("ladder_placements")
        .select("team_id, division_id, week")
        .eq("competition_id", competitionId)
        .order("week", { ascending: true }),
      supabase
        .from("teams")
        .select("id, name")
        .eq("competition_id", competitionId),
      supabase
        .from("divisions")
        .select("id, name")
        .eq("competition_id", competitionId),
    ]);

  const teamName = new Map(
    (teams ?? []).map((t) => [t.id as string, t.name as string]),
  );
  const divName = new Map(
    (divisions ?? []).map((d) => [d.id as string, d.name as string]),
  );

  const byTeam = new Map<string, LadderHistoryRow>();
  for (const p of placements ?? []) {
    const id = p.team_id as string;
    if (!byTeam.has(id)) {
      byTeam.set(id, {
        teamId: id,
        teamName: teamName.get(id) ?? "—",
        byWeek: [],
      });
    }
    byTeam.get(id)!.byWeek.push({
      week: p.week as number,
      tierName: divName.get(p.division_id as string) ?? "—",
    });
  }
  return [...byTeam.values()].sort((a, b) =>
    a.teamName.localeCompare(b.teamName),
  );
}
