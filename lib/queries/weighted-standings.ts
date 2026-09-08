import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  weightedStandings,
  type TierWeight,
  type WeekPlacement,
  type WeightedRow,
} from "@/lib/stats/weighted-standings";

export type WeightedStanding = WeightedRow & { teamName: string };

export type WeightedTable = {
  /** Empty when no tier has been priced — the section then doesn't render. */
  rows: WeightedStanding[];
  tiers: TierWeight[];
  /** Weeks that actually contributed, for the column header. */
  weeksCounted: number;
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

  const { data: divisions } = await supabase
    .from("divisions")
    .select("id, name, tier_order, weight_base, weight_per_set_win")
    .eq("competition_id", competitionId)
    .order("tier_order", { ascending: true });

  const tiers: TierWeight[] = (
    (divisions ?? []) as {
      id: string;
      name: string;
      weight_base: number | null;
      weight_per_set_win: number | null;
    }[]
  )
    .filter((d) => d.weight_base !== null && d.weight_per_set_win !== null)
    .map((d) => ({
      divisionId: d.id,
      name: d.name,
      base: d.weight_base as number,
      perSetWin: d.weight_per_set_win as number,
    }));

  if (tiers.length === 0) return { rows: [], tiers: [], weeksCounted: 0 };

  const [{ data: placements }, { data: teams }, { data: matches }] =
    await Promise.all([
      supabase
        .from("ladder_placements")
        .select("team_id, week, division_id")
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

  const rows = weightedStandings(weekPlacements, tiers)
    // A placement for a team that has since been withdrawn has no name and no
    // business in the table.
    .filter((r) => names.has(r.teamId))
    .map((r) => ({ ...r, teamName: names.get(r.teamId) as string }));

  const weeksCounted = new Set(rows.flatMap((r) => r.weeks.map((w) => w.week)))
    .size;

  return { rows, tiers, weeksCounted };
}
