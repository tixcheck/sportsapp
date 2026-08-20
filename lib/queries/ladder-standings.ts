/**
 * Standings for a ladder league — one table per night, not one per season.
 *
 * A cumulative table is the wrong artifact for a ladder. Teams move tiers every
 * week, so they never share a schedule: ranking a whole season together either
 * compares records built against completely different opposition, or — as the
 * cross-week table actually did — silently drops every game played against
 * someone who has since moved, which wipes out the record of anyone promoted or
 * relegated.
 *
 * A night is the unit that means something. It is what the teams played, and it
 * is exactly what decides who goes up and who comes down.
 *
 * The tiers here come from `ladder_placements`, which records where each team
 * WAS that week — not from `teams.division_id`, which says where they are now.
 * That distinction is the whole fix: week 1 must show a promoted team in the
 * tier it actually played in.
 */

import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";
import { rankStandings, type MatchResult } from "@/lib/scheduler/tiebreakers";
import type { RankMode } from "@/lib/scheduler/tiebreakers";
import type { StandingsRowView } from "@/lib/standings/compute";
import { buildStandingsExplainer } from "@/lib/standings/compute";

export type LadderNightTier = {
  divisionId: string;
  divisionName: string;
  rows: StandingsRowView[];
};

export type LadderNight = {
  week: number;
  /** ISO date of the night, when its games are scheduled. */
  date: string | null;
  /** Whether every game that night has a recorded result. */
  complete: boolean;
  tiers: LadderNightTier[];
};

type MatchRow = {
  id: string;
  round: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  scheduled_at: string | null;
};

/**
 * Every ladder night that has been drawn, newest first.
 *
 * Returns an empty array for a league that isn't a ladder or hasn't started, so
 * the caller can fall back to ordinary standings without a second query.
 */
export async function getLadderNightStandings(
  competitionId: string,
): Promise<LadderNight[]> {
  const supabase = await createClient();

  const [
    { data: comp },
    { data: settings },
    { data: placements },
    { data: divisions },
  ] = await Promise.all([
    supabase
      .from("competitions")
      .select("timezone")
      .eq("id", competitionId)
      .maybeSingle(),
    supabase
      .from("league_settings")
      .select("ladder_enabled, tiebreaker")
      .eq("competition_id", competitionId)
      .maybeSingle(),
    supabase
      .from("ladder_placements")
      .select("team_id, division_id, week, position")
      .eq("competition_id", competitionId)
      .order("week", { ascending: true })
      .order("position", { ascending: true }),
    supabase
      .from("divisions")
      .select("id, name, tier_order")
      .eq("competition_id", competitionId)
      .order("tier_order", { ascending: true }),
  ]);

  if (
    (settings as { ladder_enabled?: boolean } | null)?.ladder_enabled !== true
  ) {
    return [];
  }
  const placementRows = (placements ?? []) as {
    team_id: string;
    division_id: string;
    week: number;
    position: number;
  }[];
  if (placementRows.length === 0) return [];

  const mode = (
    ((settings as { tiebreaker?: string } | null)?.tiebreaker ?? "ova") ===
    "differential"
      ? "differential"
      : "ova"
  ) as RankMode;

  const divisionName = new Map(
    ((divisions ?? []) as { id: string; name: string }[]).map((d) => [
      d.id,
      d.name,
    ]),
  );
  const divisionOrder = new Map(
    ((divisions ?? []) as { id: string; tier_order: number }[]).map((d) => [
      d.id,
      d.tier_order,
    ]),
  );

  const { data: matches } = await supabase
    .from("matches")
    .select("id, round, home_team_id, away_team_id, scheduled_at")
    .eq("competition_id", competitionId)
    .not("round", "is", null);
  const matchRows = (matches ?? []) as MatchRow[];

  const { data: sets } = matchRows.length
    ? await supabase
        .from("sets")
        .select("match_id, home_score, away_score, set_number")
        .in(
          "match_id",
          matchRows.map((m) => m.id),
        )
        .order("set_number", { ascending: true })
    : { data: [] };

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

  const teamIds = [...new Set(placementRows.map((p) => p.team_id))];
  const { data: teams } = teamIds.length
    ? await supabase.from("teams").select("id, name, status").in("id", teamIds)
    : { data: [] };
  const teamName = new Map(
    ((teams ?? []) as { id: string; name: string }[]).map((t) => [
      t.id,
      t.name,
    ]),
  );
  const withdrawn = new Map(
    ((teams ?? []) as { id: string; status: string }[]).map((t) => [
      t.id,
      t.status === "withdrawn",
    ]),
  );

  // week -> divisionId -> team ids, in the ladder order they held that week.
  const byWeek = new Map<number, Map<string, string[]>>();
  for (const p of placementRows) {
    const week = byWeek.get(p.week) ?? new Map<string, string[]>();
    const tier = week.get(p.division_id) ?? [];
    tier.push(p.team_id);
    week.set(p.division_id, tier);
    byWeek.set(p.week, week);
  }

  const tz =
    (comp as { timezone?: string } | null)?.timezone ?? "America/Toronto";

  const nights: LadderNight[] = [];

  // Games each team has played across the season, accumulated as we walk the
  // weeks in order. A night's own table can only ever show that night, so this
  // is the figure that answers "how much have they actually played" — and it
  // has to be a RUNNING total, not a season-wide one, or every night would
  // repeat the same number and week 1 would claim games it hadn't reached yet.
  const seasonPlayed = new Map<string, number>();

  for (const [week, tiers] of [...byWeek].sort((a, b) => a[0] - b[0])) {
    const nightMatches = matchRows.filter((m) => m.round === week);
    // A week with placements but no games is next week's ladder, already
    // written by the lock but not yet drawn. Nothing to rank.
    if (nightMatches.length === 0) continue;

    const complete = nightMatches.every(
      (m) => (setsByMatch.get(m.id) ?? []).length > 0,
    );
    // The night's date in the LEAGUE's timezone, not UTC. Slicing the ISO
    // string looks equivalent and isn't: a Tuesday 8pm game in Toronto is
    // Wednesday 00:00Z, so the whole night would be labelled a day late.
    const firstStart = nightMatches.find((m) => m.scheduled_at)?.scheduled_at;
    const date = firstStart
      ? DateTime.fromISO(firstStart, { zone: tz }).toFormat("yyyy-MM-dd")
      : null;

    const tierViews: LadderNightTier[] = [];
    for (const [divisionId, ids] of tiers) {
      const inTier = new Set(ids);
      const own = nightMatches.filter(
        (m) =>
          m.home_team_id &&
          m.away_team_id &&
          inTier.has(m.home_team_id) &&
          inTier.has(m.away_team_id),
      );

      const results: MatchResult[] = own.map((m) => ({
        matchId: m.id,
        homeTeamId: m.home_team_id as string,
        awayTeamId: m.away_team_id as string,
        sets: setsByMatch.get(m.id) ?? [],
      }));

      // Scheduled is counted over the SAME set of games that are ranked, so the
      // "played / scheduled" fraction compares like with like. The season table
      // counted played within the tier but scheduled across the whole league,
      // which is why it showed things like 2/8 that could never reach 8/8.
      const scheduled = new Map<string, number>();
      for (const m of own) {
        for (const id of [m.home_team_id, m.away_team_id]) {
          if (id) scheduled.set(id, (scheduled.get(id) ?? 0) + 1);
        }
      }

      const played = results.filter((r) => r.sets.length > 0);
      for (const r of played) {
        for (const id of [r.homeTeamId, r.awayTeamId]) {
          seasonPlayed.set(id, (seasonPlayed.get(id) ?? 0) + 1);
        }
      }
      const ranked = rankStandings(ids, played, undefined, mode);

      tierViews.push({
        divisionId,
        divisionName: divisionName.get(divisionId) ?? "Tier",
        rows: ranked.map((r) => ({
          ...r,
          teamName: teamName.get(r.teamId) ?? "—",
          withdrawn: withdrawn.get(r.teamId) ?? false,
          gamesScheduled: scheduled.get(r.teamId) ?? 0,
          seasonGamesPlayed: seasonPlayed.get(r.teamId) ?? 0,
          explainer: buildStandingsExplainer(r, ranked, played, teamName),
          weekly: [],
        })),
      });
    }

    tierViews.sort(
      (a, b) =>
        (divisionOrder.get(a.divisionId) ?? 0) -
        (divisionOrder.get(b.divisionId) ?? 0),
    );

    nights.push({ week, date, complete, tiers: tierViews });
  }

  // Newest first: the night everyone is asking about is the one just played.
  return nights.sort((a, b) => b.week - a.week);
}
