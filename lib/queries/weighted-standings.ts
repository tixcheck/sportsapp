import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  weightedStandings,
  type TierWeight,
  type WeekPlacement,
  type WeightedRow,
} from "@/lib/stats/weighted-standings";
import {
  placementStandings,
  type PlacementRow,
  type PlacementTier,
  type WeekFinish,
} from "@/lib/stats/placement-standings";
import { rankLadderNight } from "@/lib/scheduler/ladder-week";
import type { RankMode } from "@/lib/scheduler/tiebreakers";

export type WeightedStanding = WeightedRow & { teamName: string };

export type PlacementStanding = PlacementRow & { teamName: string };

export type WeightedTable = {
  /** Empty when no tier has been priced — the section then doesn't render. */
  rows: WeightedStanding[];
  tiers: TierWeight[];
  /** Weeks that actually contributed, for the column header. */
  weeksCounted: number;
  /**
   * How this league scores (migration 0126). "placement" means `placementRows`
   * is the table to show and a LOW score is the good one; `rows` is then empty.
   */
  scoring: "points" | "placement";
  /** Populated only in placement mode, lowest score first. */
  placementRows: PlacementStanding[];
  /** Tier numbers in placement mode — what finishing FIRST there scores. */
  placementTiers: PlacementTier[];
};

/**
 * The weighted table for a ladder league.
 *
 * Set wins are counted from `sets`, not from a stored total, because standings
 * are never the source of truth here (CLAUDE.md) — the table has to be
 * derivable from the results at any moment, including after a score is
 * corrected.
 *
 * A week is a ROUND. `ladder_placements.week` and `matches.round` are the same
 * number by construction, which is what lets a set won be attributed to the
 * tier the team was sitting in when they won it.
 */
export async function getWeightedStandings(
  competitionId: string,
): Promise<WeightedTable> {
  const supabase = await createClient();

  const [{ data: divisions }, { data: settings }] = await Promise.all([
    supabase
      .from("divisions")
      .select("id, name, tier_order, weight_base, weight_per_set_win")
      .eq("competition_id", competitionId)
      .order("tier_order", { ascending: true }),
    supabase
      .from("league_settings")
      .select("ladder_scoring, tiebreaker")
      .eq("competition_id", competitionId)
      .maybeSingle(),
  ]);

  // How this league scores (migration 0126).
  const scoring =
    (settings?.ladder_scoring as "points" | "placement" | null) ?? "points";

  const divisionRows = (divisions ?? []) as {
    id: string;
    name: string;
    weight_base: number | null;
    weight_per_set_win: number | null;
  }[];

  const tiers: TierWeight[] = divisionRows
    .filter((d) => d.weight_base !== null && d.weight_per_set_win !== null)
    .map((d) => ({
      divisionId: d.id,
      name: d.name,
      base: d.weight_base as number,
      perSetWin: d.weight_per_set_win as number,
    }));

  // Placement mode prices a tier on its NUMBER alone — what finishing first
  // there scores. Demanding a per-set weight it never uses is what left Mango's
  // Fall table empty: six tiers with a base and no per-set value, all skipped.
  const placementTiers: PlacementTier[] = divisionRows
    .filter((d) => d.weight_base !== null)
    .map((d) => ({
      divisionId: d.id,
      name: d.name,
      base: d.weight_base as number,
    }));

  const empty: WeightedTable = {
    rows: [],
    tiers: [],
    weeksCounted: 0,
    scoring,
    placementRows: [],
    placementTiers: [],
  };
  const priced = scoring === "placement" ? placementTiers : tiers;
  if (priced.length === 0) return empty;

  const [{ data: placements }, { data: teams }, { data: matches }] =
    await Promise.all([
      supabase
        .from("ladder_placements")
        // `position` orders each tier's roster for ranking; `result_rank` is the
        // finishing order an organizer typed in directly (migration 0117).
        .select("team_id, week, division_id, position, result_rank")
        .eq("competition_id", competitionId),
      supabase
        .from("teams")
        .select("id, name")
        .eq("competition_id", competitionId)
        .neq("status", "withdrawn"),
      supabase
        .from("matches")
        .select("id, round, home_team_id, away_team_id, status")
        .eq("competition_id", competitionId)
        .eq("status", "completed"),
    ]);

  const matchRows = (matches ?? []) as {
    id: string;
    round: number | null;
    home_team_id: string | null;
    away_team_id: string | null;
  }[];

  const { data: sets } = matchRows.length
    ? await supabase
        .from("sets")
        .select("match_id, home_score, away_score")
        .in(
          "match_id",
          matchRows.map((m) => m.id),
        )
    : {
        data: [] as {
          match_id: string;
          home_score: number;
          away_score: number;
        }[],
      };

  // Sets won, per team per round.
  const wins = new Map<string, number>();
  const matchById = new Map(matchRows.map((m) => [m.id, m]));
  for (const s of (sets ?? []) as {
    match_id: string;
    home_score: number;
    away_score: number;
  }[]) {
    const m = matchById.get(s.match_id);
    if (!m || m.round === null) continue;
    // A drawn set wins nothing for either side; a capped set that ended level
    // is rare but real, and awarding both teams a win would inflate the table.
    if (s.home_score === s.away_score) continue;
    const winner =
      s.home_score > s.away_score ? m.home_team_id : m.away_team_id;
    if (!winner) continue;
    const key = `${winner}:${m.round}`;
    wins.set(key, (wins.get(key) ?? 0) + 1);
  }

  const weekPlacements: WeekPlacement[] = (
    (placements ?? []) as {
      team_id: string;
      week: number;
      division_id: string;
    }[]
  ).map((p) => ({
    teamId: p.team_id,
    week: p.week,
    divisionId: p.division_id,
    setsWon: wins.get(`${p.team_id}:${p.week}`) ?? 0,
  }));

  const names = new Map(
    ((teams ?? []) as { id: string; name: string }[]).map((t) => [
      t.id,
      t.name,
    ]),
  );

  if (scoring === "placement") {
    // Where each team FINISHED on each night. Two sources, in order: the rank
    // an organizer typed in (migration 0117, one line per team beats forty),
    // and failing that the order derived from the night's own results using the
    // league's configured tiebreaker — the same ranking the standings show.
    const setsByMatch = new Map<string, { home: number; away: number }[]>();
    for (const s of (sets ?? []) as {
      match_id: string;
      home_score: number;
      away_score: number;
    }[]) {
      const list = setsByMatch.get(s.match_id) ?? [];
      list.push({ home: s.home_score, away: s.away_score });
      setsByMatch.set(s.match_id, list);
    }

    const placementRows = (placements ?? []) as {
      team_id: string;
      week: number;
      division_id: string;
      position: number;
      result_rank: number | null;
    }[];

    // A "_projected" suffix encodes a display option, not a different order.
    const mode = (((settings?.tiebreaker as string) ?? "ova").replace(
      "_projected",
      "",
    ) || "ova") as RankMode;

    const derived = new Map<string, number>();
    for (const week of new Set(placementRows.map((p) => p.week))) {
      const forWeek = placementRows.filter((p) => p.week === week);
      const rosters = [...new Set(forWeek.map((p) => p.division_id))].map(
        (divisionId) => ({
          divisionId,
          teamIds: forWeek
            .filter((p) => p.division_id === divisionId)
            .sort((a, b) => a.position - b.position)
            .map((p) => p.team_id),
        }),
      );
      const results = matchRows
        .filter((m) => m.round === week && m.home_team_id && m.away_team_id)
        .map((m) => ({
          matchId: m.id,
          homeTeamId: m.home_team_id as string,
          awayTeamId: m.away_team_id as string,
          sets: setsByMatch.get(m.id) ?? [],
        }));
      // No results yet is not a goalless night — it is a night that has not
      // happened, and scoring it would invent a finishing order.
      if (results.length === 0) continue;
      for (const tier of rankLadderNight(rosters, results, mode)) {
        tier.rankedTeamIds.forEach((teamId, i) =>
          derived.set(`${teamId}:${week}`, i + 1),
        );
      }
    }

    const finishes: WeekFinish[] = placementRows.map((p) => ({
      teamId: p.team_id,
      week: p.week,
      divisionId: p.division_id,
      rank: p.result_rank ?? derived.get(`${p.team_id}:${p.week}`) ?? null,
    }));

    const scored = placementStandings(finishes, placementTiers)
      .filter((r) => names.has(r.teamId))
      .map((r) => ({ ...r, teamName: names.get(r.teamId) as string }));

    return {
      ...empty,
      placementRows: scored,
      placementTiers,
      weeksCounted: new Set(scored.flatMap((r) => r.weeks.map((w) => w.week)))
        .size,
    };
  }

  const rows = weightedStandings(weekPlacements, tiers)
    // A placement for a team that has since been withdrawn has no name and no
    // business in the table.
    .filter((r) => names.has(r.teamId))
    .map((r) => ({ ...r, teamName: names.get(r.teamId) as string }));

  const weeksCounted = new Set(rows.flatMap((r) => r.weeks.map((w) => w.week)))
    .size;

  return { ...empty, rows, tiers, weeksCounted };
}
