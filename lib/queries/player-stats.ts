/**
 * Turning set scores into per-player rows.
 *
 * The maths lives in `lib/stats/player-stats.ts`; this decides WHICH sets
 * belong to whom, which is the part that differs by format.
 *
 * Today it handles the fixed-roster case: everyone on a team is credited with
 * every set that team played. That is exactly right for a 2s league, where a
 * team IS its two players and they play every set together. It is an
 * approximation for a 6s league where people miss nights — which is what the
 * attendance model will fix, by narrowing the set list per player rather than
 * by changing any of the arithmetic below.
 */

import { createClient } from "@/lib/supabase/server";
import {
  computePlayerStats,
  type PlayerStats,
  type SetResult,
} from "@/lib/stats/player-stats";

export type PlayerStatRow = {
  /** Null for a roster spot whose invite was never claimed. */
  userId: string | null;
  name: string;
  teamId: string;
  teamName: string;
  /** True when this is a pending invite rather than a linked account. */
  pending: boolean;
  stats: PlayerStats;
};

export type TeamStatRow = {
  teamId: string;
  teamName: string;
  stats: PlayerStats;
};

type SetRow = {
  match_id: string;
  home_score: number;
  away_score: number;
};

type MatchRow = {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
};

/**
 * Every team's sets in a competition, from that team's own perspective.
 *
 * Built once and shared: a player's stats are their team's set list, so pulling
 * this per player would re-read the same rows a dozen times.
 */
async function setsByTeam(
  competitionId: string,
): Promise<Map<string, SetResult[]>> {
  const supabase = await createClient();

  const { data: matches } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id")
    .eq("competition_id", competitionId);
  const matchRows = (matches ?? []) as MatchRow[];
  if (matchRows.length === 0) return new Map();

  const { data: sets } = await supabase
    .from("sets")
    .select("match_id, home_score, away_score")
    .in(
      "match_id",
      matchRows.map((m) => m.id),
    );

  const byMatch = new Map(matchRows.map((m) => [m.id, m]));
  const out = new Map<string, SetResult[]>();
  const push = (teamId: string, result: SetResult) => {
    const list = out.get(teamId);
    if (list) list.push(result);
    else out.set(teamId, [result]);
  };

  for (const s of (sets ?? []) as SetRow[]) {
    const m = byMatch.get(s.match_id);
    if (!m) continue;
    // A set is one row but two perspectives — each side sees the scores the
    // other way round, which is what makes "points for" mean anything.
    if (m.home_team_id) {
      push(m.home_team_id, { for: s.home_score, against: s.away_score });
    }
    if (m.away_team_id) {
      push(m.away_team_id, { for: s.away_score, against: s.home_score });
    }
  }
  return out;
}

/** Per-team statistics — the same columns, before they're split per player. */
export async function getTeamStats(
  competitionId: string,
): Promise<TeamStatRow[]> {
  const supabase = await createClient();
  const sets = await setsByTeam(competitionId);

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name")
    .eq("competition_id", competitionId)
    .neq("status", "pending_payment");

  return ((teams ?? []) as { id: string; name: string }[])
    .map((t) => ({
      teamId: t.id,
      teamName: t.name,
      stats: computePlayerStats(sets.get(t.id) ?? []),
    }))
    .filter((r) => r.stats.gamesPlayed > 0);
}

/**
 * Per-player statistics for a competition.
 *
 * Roster comes from linked accounts PLUS pending invites: a 2s pair where only
 * one partner ever claimed their invite would otherwise show half a team, and
 * the organizer knows both names perfectly well. Pending rows are marked so the
 * UI can say why there's no profile behind the name.
 */
export async function getPlayerStats(
  competitionId: string,
): Promise<PlayerStatRow[]> {
  const supabase = await createClient();
  const sets = await setsByTeam(competitionId);

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name")
    .eq("competition_id", competitionId)
    .neq("status", "pending_payment");
  const teamRows = (teams ?? []) as { id: string; name: string }[];
  if (teamRows.length === 0) return [];
  const teamIds = teamRows.map((t) => t.id);
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]));

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("team_members")
      .select("team_id, user_id")
      .in("team_id", teamIds),
    supabase
      .from("team_invites")
      .select("team_id, name, email, status")
      .in("team_id", teamIds)
      .eq("status", "pending"),
  ]);

  const memberRows = (members ?? []) as { team_id: string; user_id: string }[];
  const userIds = [...new Set(memberRows.map((m) => m.user_id))];
  const { data: users } = userIds.length
    ? await supabase
        .from("users")
        .select("id, display_name, email")
        .in("id", userIds)
    : { data: [] };

  const nameById = new Map(
    (
      (users ?? []) as {
        id: string;
        display_name: string | null;
        email: string;
      }[]
    ).map((u) => [u.id, u.display_name || u.email]),
  );

  const rows: PlayerStatRow[] = [];

  for (const m of memberRows) {
    const teamSets = sets.get(m.team_id) ?? [];
    rows.push({
      userId: m.user_id,
      name: nameById.get(m.user_id) ?? "Player",
      teamId: m.team_id,
      teamName: teamName.get(m.team_id) ?? "",
      pending: false,
      stats: computePlayerStats(teamSets),
    });
  }

  for (const i of (invites ?? []) as {
    team_id: string;
    name: string | null;
    email: string;
  }[]) {
    const label = (i.name || i.email).trim();
    if (!label) continue;
    rows.push({
      userId: null,
      name: label,
      teamId: i.team_id,
      teamName: teamName.get(i.team_id) ?? "",
      pending: true,
      stats: computePlayerStats(sets.get(i.team_id) ?? []),
    });
  }

  return rows.filter((r) => r.stats.gamesPlayed > 0);
}

export type PlayerProfile = {
  userId: string;
  name: string;
  /** One line per competition they've played in, most recent first. */
  competitions: {
    competitionId: string;
    competitionName: string;
    slug: string;
    type: "league" | "tournament";
    teamId: string;
    teamName: string;
    stats: PlayerStats;
  }[];
  /** Everything above, added together. */
  career: PlayerStats;
};

/**
 * One player's record across every competition they've played in.
 *
 * Career totals are recomputed from the combined set list rather than summed
 * from the per-competition rows — averages and ratios don't add, and summing
 * them would quietly produce a mean of means that is wrong whenever two
 * competitions have different numbers of sets.
 */
export async function getPlayerProfile(
  userId: string,
): Promise<PlayerProfile | null> {
  const supabase = await createClient();

  const { data: user } = await supabase
    .from("users")
    .select("id, display_name, email")
    .eq("id", userId)
    .maybeSingle();
  if (!user) return null;
  const u = user as { id: string; display_name: string | null; email: string };

  const { data: memberships } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);
  const teamIds = ((memberships ?? []) as { team_id: string }[]).map(
    (m) => m.team_id,
  );
  if (teamIds.length === 0) {
    return {
      userId: u.id,
      name: u.display_name || u.email,
      competitions: [],
      career: computePlayerStats([]),
    };
  }

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, competition_id")
    .in("id", teamIds);
  const teamRows = (teams ?? []) as {
    id: string;
    name: string;
    competition_id: string;
  }[];

  const compIds = [...new Set(teamRows.map((t) => t.competition_id))];
  const { data: comps } = compIds.length
    ? await supabase
        .from("competitions")
        .select("id, name, slug, type, start_date")
        .in("id", compIds)
    : { data: [] };
  const compById = new Map(
    (
      (comps ?? []) as {
        id: string;
        name: string;
        slug: string;
        type: string;
        start_date: string | null;
      }[]
    ).map((c) => [c.id, c]),
  );

  // One pass per competition, reusing the same per-team set builder the
  // organizer's table uses — so a profile can never disagree with the table.
  const perComp = await Promise.all(
    compIds.map(async (id) => ({ id, sets: await setsByTeam(id) })),
  );
  const setsFor = new Map(perComp.map((p) => [p.id, p.sets]));

  const rows: PlayerProfile["competitions"] = [];
  const allSets: SetResult[] = [];

  for (const t of teamRows) {
    const comp = compById.get(t.competition_id);
    if (!comp) continue;
    const sets = setsFor.get(t.competition_id)?.get(t.id) ?? [];
    if (sets.length === 0) continue;
    allSets.push(...sets);
    rows.push({
      competitionId: comp.id,
      competitionName: comp.name,
      slug: comp.slug,
      type: comp.type === "league" ? "league" : "tournament",
      teamId: t.id,
      teamName: t.name,
      stats: computePlayerStats(sets),
    });
  }

  rows.sort((a, b) => a.competitionName.localeCompare(b.competitionName));

  return {
    userId: u.id,
    name: u.display_name || u.email,
    competitions: rows,
    career: computePlayerStats(allSets),
  };
}
