import { createClient } from "@/lib/supabase/server";
import type { LadderUnit } from "@/lib/validations/ladder";

export interface LadderTierView {
  divisionId: string;
  name: string;
  tierOrder: number;
  teams: { teamId: string; name: string; position: number }[];
}

export interface LadderState {
  enabled: boolean;
  unit: LadderUnit;
  target: number;
  /** One count per boundary, top-down. Length is (tiers - 1). */
  swaps: number[];
  tiers: { divisionId: string; name: string; tierOrder: number }[];
  /** Highest week with placements. 0 = the ladder hasn't started. */
  currentWeek: number;
  /** Tiers with their rosters for `currentWeek`. Empty before the start. */
  standingsThisWeek: LadderTierView[];
  /** Whether every game in the current week has a result. */
  currentWeekComplete: boolean;
  /** Games drawn for the current week (0 = drawn but not yet generated). */
  currentWeekGames: number;
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
      .select("ladder_enabled, ladder_unit, ladder_target, ladder_swaps")
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
    .select("team_id, division_id, week, position")
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

  if (currentWeek > 0) {
    const thisWeek = (placements ?? []).filter((p) => p.week === currentWeek);
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name")
      .eq("competition_id", competitionId);
    const teamName = new Map(
      (teams ?? []).map((t) => [t.id as string, t.name as string]),
    );

    standingsThisWeek = tiers.map((t) => ({
      ...t,
      teams: thisWeek
        .filter((p) => p.division_id === t.divisionId)
        .sort((a, b) => (a.position as number) - (b.position as number))
        .map((p) => ({
          teamId: p.team_id as string,
          name: teamName.get(p.team_id as string) ?? "—",
          position: p.position as number,
        })),
    }));

    const { data: weekMatches } = await supabase
      .from("matches")
      .select("id, status")
      .eq("competition_id", competitionId)
      .eq("round", currentWeek);
    currentWeekGames = (weekMatches ?? []).length;
    currentWeekComplete =
      currentWeekGames > 0 &&
      (weekMatches ?? []).every((m) => SETTLED.has(m.status as string));
  }

  return {
    enabled: settings.ladder_enabled === true,
    unit: (settings.ladder_unit as LadderUnit) ?? "sets",
    target: (settings.ladder_target as number) ?? 6,
    swaps: (settings.ladder_swaps as number[] | null) ?? [],
    tiers,
    currentWeek,
    standingsThisWeek,
    currentWeekComplete,
    currentWeekGames,
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
