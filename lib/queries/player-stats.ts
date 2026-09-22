/**
 * Turning set scores into per-player rows.
 *
 * The maths lives in `lib/stats/player-stats.ts`; this decides WHICH sets
 * belong to whom, which is the part that differs by format.
 *
 * Two attribution rules, chosen per competition:
 *
 *   Fixed roster (default) — everyone on a team is credited with every set that
 *   team played. Exactly right for a 2s league, where a team IS its two players
 *   and they play every set together.
 *
 *   Appearances (`competitions.track_appearances`) — a player is credited with
 *   the matches they actually turned out for. Necessary for a drafted 6s league
 *   where people miss nights, subs fill in, and rosters change every few weeks.
 *
 * Neither changes the arithmetic below; they change which sets go into it.
 */

import { createClient } from "@/lib/supabase/server";
import { getFullTimeRoster } from "@/lib/queries/full-time-roster";
import { isFullTime } from "@/lib/stats/roster-split";
import {
  matchOutcome,
  playoffNightsFor,
  tallyAttendance,
  type Absence,
  type MatchOutcome,
} from "@/lib/stats/attendance";
import { nightOf } from "@/lib/stats/night-lineup";
import type { StatsReadiness } from "@/lib/stats/empty-reason";
import {
  computePlayerStats,
  type PlayerStats,
  type SetResult,
} from "@/lib/stats/player-stats";
import {
  attributeByAppearance,
  identityKey,
  type Appearance,
  type MatchSets,
} from "@/lib/stats/attribution";

export type PlayerStatRow = {
  /** Null for a roster spot whose invite was never claimed. */
  userId: string | null;
  name: string;
  teamId: string;
  teamName: string;
  /** True when this is a pending invite rather than a linked account. */
  pending: boolean;
  stats: PlayerStats;
  /**
   * Distinct nights on court, for any team. Null where the league does not
   * record who played - there, every rostered player is credited with every
   * set, so a night count would say nothing.
   */
  daysPlayed: number | null;
  /** Games won on playoff nights. Null where the league has no sessions. */
  playoffGameWins: number | null;
  /**
   * Nights on a roster without playing any of the team's games. Null unless
   * the caller asked for absences, which only organizers can read - anyone
   * else would get zero rows and see a perfect record that isn't one.
   */
  nightsMissed: number | null;
  /**
   * Drafted onto a team, rather than covering a night. Roster MEMBERSHIP, not
   * how they played: a drafted player who turned out as a sub for another team
   * is still full-time. True for every row where the league drafted nobody, so
   * an undrafted league shows one sheet rather than filing everyone as a sub.
   */
  fullTime: boolean;
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
    .eq("status", "active");

  return ((teams ?? []) as { id: string; name: string }[])
    .map((t) => ({
      teamId: t.id,
      teamName: t.name,
      stats: computePlayerStats(sets.get(t.id) ?? []),
    }))
    .filter((r) => r.stats.gamesPlayed > 0);
}

/** Does this competition score by who turned up, rather than by roster? */
async function tracksAppearances(competitionId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("competitions")
    .select("track_appearances")
    .eq("id", competitionId)
    .maybeSingle();
  return (
    (data as { track_appearances?: boolean } | null)?.track_appearances === true
  );
}

/**
 * Per-player stats for a competition that records who played.
 *
 * Names come from the appearance row rather than the roster: a sub may have no
 * account, and the person who actually played is the person whose record this
 * is. Team is the last team they turned out for IN SEASON ORDER, so a
 * re-drafted player shows under their current side while their sets keep the
 * whole season — see `seasonOrder`, which is what makes "last" mean anything.
 */
async function playerStatsByAppearance(
  competitionId: string,
  includeAbsences: boolean,
): Promise<PlayerStatRow[]> {
  const supabase = await createClient();

  const [
    { data: rows },
    { data: teams },
    { data: comp },
    { data: settings },
    { data: matchRows },
    { data: absenceRows },
  ] = await Promise.all([
    supabase
      .from("match_appearances")
      .select("match_id, team_id, user_id, player_name, role")
      .eq("competition_id", competitionId),
    supabase
      .from("teams")
      .select("id, name")
      .eq("competition_id", competitionId),
    supabase
      .from("competitions")
      .select("timezone")
      .eq("id", competitionId)
      .maybeSingle(),
    supabase
      .from("league_settings")
      .select("session_nights")
      .eq("competition_id", competitionId)
      .maybeSingle(),
    supabase
      .from("matches")
      .select("id, scheduled_at")
      .eq("competition_id", competitionId),
    // Organizer-only (migration 0121). Asked for only when the caller may
    // read it, so the public page hides the column instead of showing zeros.
    includeAbsences
      ? supabase
          .from("match_absences")
          .select("match_id, team_id, user_id, player_name")
          .eq("competition_id", competitionId)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const appearances: Appearance[] = (
    (rows ?? []) as {
      match_id: string;
      team_id: string;
      user_id: string | null;
      player_name: string;
      role: "rostered" | "sub";
    }[]
  ).map((r) => ({
    matchId: r.match_id,
    teamId: r.team_id,
    userId: r.user_id,
    playerName: r.player_name,
    role: r.role,
  }));
  const absences: Absence[] = (
    (absenceRows ?? []) as {
      match_id: string;
      team_id: string;
      user_id: string | null;
      player_name: string;
    }[]
  ).map((r) => ({
    matchId: r.match_id,
    teamId: r.team_id,
    userId: r.user_id,
    playerName: r.player_name,
  }));
  if (appearances.length === 0 && absences.length === 0) return [];

  const teamName = new Map(
    ((teams ?? []) as { id: string; name: string }[]).map((t) => [
      t.id,
      t.name,
    ]),
  );
  const timezone =
    (comp as { timezone: string | null } | null)?.timezone ?? "America/Toronto";
  const sessionNights =
    (settings as { session_nights: number | null } | null)?.session_nights ??
    null;

  const nightOfMatch = new Map<string, string>();
  for (const m of (matchRows ?? []) as {
    id: string;
    scheduled_at: string | null;
  }[]) {
    const night = nightOf(m.scheduled_at, timezone);
    if (night) nightOfMatch.set(m.id, night);
  }

  // Reuse the per-team set lists, re-keyed by match so an appearance can pick
  // out just the games that player was there for.
  const [matchSets, matchOrder] = await Promise.all([
    setsByMatchAndTeam(competitionId),
    seasonOrder(competitionId),
  ]);

  const outcomes = new Map<string, MatchOutcome | null>();
  for (const ms of matchSets) {
    outcomes.set(`${ms.matchId}:${ms.teamId}`, matchOutcome(ms.sets));
  }
  const attendance = tallyAttendance({
    appearances,
    absences,
    nightOfMatch,
    outcomeOf: (matchId, teamId) =>
      outcomes.get(`${matchId}:${teamId}`) ?? null,
    // Scheduled nights, not scored ones: a playoff is a playoff before anyone
    // has entered its results.
    playoffNights: playoffNightsFor([...nightOfMatch.values()], sessionNights),
  });
  const extras = (userId: string | null, name: string) => {
    const t = attendance.get(identityKey({ userId, playerName: name }));
    return {
      daysPlayed: t?.daysPlayed ?? 0,
      playoffGameWins: sessionNights ? (t?.playoffGameWins ?? 0) : null,
      nightsMissed: includeAbsences ? (t?.nightsMissed ?? 0) : null,
    };
  };

  // Incomplete until the roster is known: `fullTime` is added by `flag` below,
  // once `getFullTimeRoster` has answered. Typing these as full rows and
  // filling in a placeholder would be a lie the compiler would let through.
  const attributed: Omit<PlayerStatRow, "fullTime">[] = attributeByAppearance(
    appearances,
    matchSets,
    matchOrder,
  ).map((p) => {
    const teamId = p.teamIds[p.teamIds.length - 1] ?? "";
    return {
      userId: p.userId,
      name: p.name,
      teamId,
      teamName: teamName.get(teamId) ?? "",
      pending: false,
      stats: computePlayerStats(p.sets),
      ...extras(p.userId, p.name),
    };
  });

  // Somebody who has only ever been absent has no appearance to attribute
  // from - and is precisely who the Missed column exists to surface.
  const seen = new Set(
    attributed.map((r) =>
      identityKey({ userId: r.userId, playerName: r.name }),
    ),
  );
  const absentOnly: Omit<PlayerStatRow, "fullTime">[] = [];
  for (const ab of absences) {
    const key = identityKey(ab);
    if (seen.has(key)) continue;
    seen.add(key);
    absentOnly.push({
      userId: ab.userId,
      name: ab.playerName.trim(),
      teamId: ab.teamId,
      teamName: teamName.get(ab.teamId) ?? "",
      pending: false,
      stats: computePlayerStats([]),
      ...extras(ab.userId, ab.playerName),
    });
  }

  // Full-time is the roster, not the role played on the night — see
  // `roster-split.ts`. An undrafted league has an empty roster, and flagging
  // everyone as a sub there would be a worse reading than not splitting at all.
  const rosterKeys = await getFullTimeRoster(competitionId);
  const flag = (r: Omit<PlayerStatRow, "fullTime">): PlayerStatRow => ({
    ...r,
    fullTime:
      rosterKeys.size === 0 ||
      isFullTime({ userId: r.userId, name: r.name }, rosterKeys),
  });

  // A night on court counts before its scores are in: attendance is recorded
  // the night it happens, and hiding it until somebody enters results would
  // hide the one number the organizer is chasing.
  return [...attributed, ...absentOnly]
    .filter(
      (r) =>
        r.stats.gamesPlayed > 0 ||
        (r.daysPlayed ?? 0) > 0 ||
        (r.nightsMissed ?? 0) > 0,
    )
    .map(flag);
}

/** Every match's sets, from each side's perspective. */
async function setsByMatchAndTeam(competitionId: string): Promise<MatchSets[]> {
  const supabase = await createClient();
  const { data: matches } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id")
    .eq("competition_id", competitionId);
  const matchRows = (matches ?? []) as MatchRow[];
  if (matchRows.length === 0) return [];

  const { data: sets } = await supabase
    .from("sets")
    .select("match_id, home_score, away_score")
    .in(
      "match_id",
      matchRows.map((m) => m.id),
    );

  const out = new Map<string, MatchSets>();
  const push = (matchId: string, teamId: string, result: SetResult) => {
    const key = `${matchId}:${teamId}`;
    const entry = out.get(key);
    if (entry) entry.sets.push(result);
    else out.set(key, { matchId, teamId, sets: [result] });
  };

  const byMatch = new Map(matchRows.map((m) => [m.id, m]));
  for (const s of (sets ?? []) as SetRow[]) {
    const m = byMatch.get(s.match_id);
    if (!m) continue;
    if (m.home_team_id) {
      push(s.match_id, m.home_team_id, {
        for: s.home_score,
        against: s.away_score,
      });
    }
    if (m.away_team_id) {
      push(s.match_id, m.away_team_id, {
        for: s.away_score,
        against: s.home_score,
      });
    }
  }
  return [...out.values()];
}

/**
 * Per-player statistics for a competition.
 *
 * Names come from `competition_player_names` (migration 0078) rather than from
 * `users` directly. That function returns the display name and NOTHING else,
 * which is what lets the same query serve the organizer's tab and the public
 * league page: RLS can only grant a whole row, and the row carries an email.
 *
 * A consequence worth knowing: a roster spot whose invite was never claimed
 * appears only if the organizer typed a name for it. The old code fell back to
 * the invitee's email, which on a public page would publish an address.
 */
export async function getPlayerStats(
  competitionId: string,
  options: { includeAbsences?: boolean } = {},
): Promise<PlayerStatRow[]> {
  if (await tracksAppearances(competitionId)) {
    return playerStatsByAppearance(
      competitionId,
      options.includeAbsences === true,
    );
  }

  const supabase = await createClient();
  const sets = await setsByTeam(competitionId);

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name")
    .eq("competition_id", competitionId)
    .eq("status", "active");
  const teamRows = (teams ?? []) as { id: string; name: string }[];
  if (teamRows.length === 0) return [];
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]));

  const { data: names } = await supabase.rpc("competition_player_names", {
    _competition_id: competitionId,
  });

  return (
    (names ?? []) as {
      team_id: string;
      user_id: string | null;
      name: string;
      pending: boolean;
    }[]
  )
    .filter((n) => teamName.has(n.team_id))
    .map((n) => ({
      userId: n.user_id,
      name: n.name,
      teamId: n.team_id,
      teamName: teamName.get(n.team_id) ?? "",
      pending: n.pending,
      stats: computePlayerStats(sets.get(n.team_id) ?? []),
      daysPlayed: null,
      playoffGameWins: null,
      nightsMissed: null,
      // Every name here came from a roster — team members, unclaimed invites,
      // or drafted players. A league with no lineups has no subs to separate.
      fullTime: true,
    }))
    .filter((r) => r.stats.gamesPlayed > 0);
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

/**
 * Match id -> where that match sits in the season.
 *
 * Only used to decide which team a player is on NOW. Scheduled time first,
 * since that is what "later in the season" means to everyone involved; round
 * breaks ties within a night, and an unscheduled match sorts last rather than
 * jumping to the front on a null.
 */
async function seasonOrder(
  competitionId: string,
): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("matches")
    .select("id, scheduled_at, round")
    .eq("competition_id", competitionId);

  const rows = (
    (data ?? []) as {
      id: string;
      scheduled_at: string | null;
      round: number | null;
    }[]
  )
    .map((m) => ({
      id: m.id,
      when: m.scheduled_at ? Date.parse(m.scheduled_at) : Number.NaN,
      round: m.round ?? 0,
    }))
    .sort((a, b) => {
      const av = Number.isNaN(a.when) ? Number.MAX_SAFE_INTEGER : a.when;
      const bv = Number.isNaN(b.when) ? Number.MAX_SAFE_INTEGER : b.when;
      return av - bv || a.round - b.round || a.id.localeCompare(b.id);
    });

  return new Map(rows.map((r, i) => [r.id, i]));
}

/**
 * Why the player-stats table is empty, for the sentence shown in its place.
 *
 * Counted here rather than inferred from the rows, because "no rows" has
 * several causes in an appearance league and they need different advice. See
 * `lib/stats/empty-reason.ts`.
 *
 * Only called when there is nothing to show, so the three extra reads cost
 * nothing on a league with stats.
 */
export async function getStatsReadiness(
  competitionId: string,
): Promise<StatsReadiness> {
  const supabase = await createClient();
  const tracks = await tracksAppearances(competitionId);

  const [{ data: matches }, { data: sets }, { data: apps }] = await Promise.all(
    [
      supabase.from("matches").select("id").eq("competition_id", competitionId),
      supabase
        .from("sets")
        .select("match_id, matches!inner(competition_id)")
        .eq("matches.competition_id", competitionId),
      supabase
        .from("match_appearances")
        .select("match_id")
        .eq("competition_id", competitionId),
    ],
  );

  const known = new Set((matches ?? []).map((m) => m.id as string));
  const scored = new Set(
    (sets ?? []).map((s) => s.match_id as string).filter((id) => known.has(id)),
  );
  const lineup = new Set(
    (apps ?? []).map((a) => a.match_id as string).filter((id) => known.has(id)),
  );

  let both = 0;
  for (const id of scored) if (lineup.has(id)) both += 1;

  return {
    tracksAppearances: tracks,
    scoredMatches: scored.size,
    lineupMatches: lineup.size,
    bothMatches: both,
  };
}
