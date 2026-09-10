import { createClient } from "@/lib/supabase/server";
import { getTeamRosters, type RosterMember } from "@/lib/queries/roster";
import {
  matchesForTeamOnNight,
  playingNights,
  teamsPlayingOnNight,
  type NightMatch,
} from "@/lib/stats/night-lineup";

/**
 * Everything the lineup screen needs for one night.
 *
 * Assembled per night rather than per match because that is how subbing works:
 * somebody covers the evening, not game four. The rows still land per match —
 * see `lib/stats/night-lineup.ts` for why that grain is worth keeping.
 */

export interface LineupPlayer {
  /** Null for a sub playing without an account. */
  userId: string | null;
  name: string;
  role: "rostered" | "sub";
  /** True when they are on the roster, whether or not they played. */
  onRoster: boolean;
  /** True when an appearance is already recorded for this night. */
  played: boolean;
}

export interface TeamLineup {
  teamId: string;
  teamName: string;
  /** How many of this team's games fall on the night. */
  matchCount: number;
  players: LineupPlayer[];
}

export interface NightLineups {
  timezone: string;
  nights: string[];
  night: string | null;
  teams: TeamLineup[];
}

export async function getNightLineups(
  competitionId: string,
  requestedNight: string | null,
  /** `yyyy-MM-dd` in the competition's zone — used to pick a sensible default. */
  today: string,
): Promise<NightLineups> {
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from("competitions")
    .select("timezone")
    .eq("id", competitionId)
    .maybeSingle();
  const timezone =
    (comp as { timezone: string | null } | null)?.timezone ?? "America/Toronto";

  const { data: rows } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id, scheduled_at")
    .eq("competition_id", competitionId);

  const matches: NightMatch[] = (
    (rows ?? []) as {
      id: string;
      home_team_id: string | null;
      away_team_id: string | null;
      scheduled_at: string | null;
    }[]
  ).map((r) => ({
    id: r.id,
    homeTeamId: r.home_team_id,
    awayTeamId: r.away_team_id,
    scheduledAt: r.scheduled_at,
  }));

  const nights = playingNights(matches, timezone);
  // Default to the night most likely being filled in: the one just played, or
  // tonight. An organizer records attendance after the games, not before.
  const night =
    requestedNight && nights.includes(requestedNight)
      ? requestedNight
      : ([...nights].reverse().find((n) => n <= today) ?? nights[0] ?? null);

  if (!night) return { timezone, nights, night: null, teams: [] };

  const teamIds = teamsPlayingOnNight(matches, night, timezone);
  if (teamIds.length === 0) return { timezone, nights, night, teams: [] };

  const nightMatchIds = new Set(
    teamIds.flatMap((id) =>
      matchesForTeamOnNight(matches, id, night, timezone),
    ),
  );

  const [
    { data: teamRows },
    rosters,
    { data: draftedRows },
    { data: appearanceRows },
  ] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name")
      .eq("competition_id", competitionId),
    getTeamRosters(competitionId),
    // Drafted players are NOT all in team_members. `place_free_agents` only
    // inserts a member row when the free agent has an account, and in a
    // drafted league most do not — the organizer typed their names. Reading
    // only team_members showed six-player Big Shoots teams as empty.
    supabase
      .from("free_agents")
      .select("user_id, name, placed_team_id, draft_rank")
      .eq("competition_id", competitionId)
      .eq("status", "placed"),
    supabase
      .from("match_appearances")
      .select("match_id, team_id, user_id, player_name, role")
      .eq("competition_id", competitionId),
  ]);

  const draftedByTeam = new Map<
    string,
    { userId: string | null; name: string }[]
  >();
  for (const d of (
    (draftedRows ?? []) as {
      user_id: string | null;
      name: string;
      placed_team_id: string | null;
      draft_rank: number | null;
    }[]
  )
    .slice()
    .sort(
      (a, b) =>
        (a.draft_rank ?? Number.MAX_SAFE_INTEGER) -
          (b.draft_rank ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name),
    )) {
    if (!d.placed_team_id) continue;
    const list = draftedByTeam.get(d.placed_team_id) ?? [];
    list.push({ userId: d.user_id, name: d.name });
    draftedByTeam.set(d.placed_team_id, list);
  }

  const teamName = new Map(
    ((teamRows ?? []) as { id: string; name: string }[]).map((t) => [
      t.id,
      t.name,
    ]),
  );

  // Only this night's appearances, collapsed from per-match back to per-night:
  // the same lineup is written to each game, so the first row per person is the
  // whole answer.
  const playedThisNight = new Map<string, Map<string, LineupPlayer>>();
  for (const a of (appearanceRows ?? []) as {
    match_id: string;
    team_id: string;
    user_id: string | null;
    player_name: string;
    role: "rostered" | "sub";
  }[]) {
    if (!nightMatchIds.has(a.match_id)) continue;
    const key = a.user_id ?? `n:${a.player_name.trim().toLowerCase()}`;
    const forTeam = playedThisNight.get(a.team_id) ?? new Map();
    if (!forTeam.has(key)) {
      forTeam.set(key, {
        userId: a.user_id,
        name: a.player_name,
        role: a.role,
        onRoster: false,
        played: true,
      });
    }
    playedThisNight.set(a.team_id, forTeam);
  }

  const teams: TeamLineup[] = teamIds.map((teamId) => {
    const roster = teamRoster(
      (rosters[teamId] ?? []) as RosterMember[],
      draftedByTeam.get(teamId) ?? [],
    );
    const recorded =
      playedThisNight.get(teamId) ?? new Map<string, LineupPlayer>();
    const nothingRecorded = recorded.size === 0;

    // The roster first, in roster order, each ticked if they played. Before
    // anything is recorded everyone starts ticked — the common night is
    // "everybody turned up", and an organizer should be unticking exceptions
    // rather than re-entering their whole team.
    const players: LineupPlayer[] = roster.map((m) => ({
      userId: m.userId,
      name: m.name,
      role: "rostered" as const,
      onRoster: true,
      played: nothingRecorded ? true : recorded.has(memberKey(m)),
    }));

    // Then anyone who played but isn't on the roster — the subs.
    const rosterKeys = new Set(roster.map(memberKey));
    for (const [key, p] of recorded) {
      if (rosterKeys.has(key)) continue;
      players.push({ ...p, role: "sub", onRoster: false });
    }

    return {
      teamId,
      teamName: teamName.get(teamId) ?? "Team",
      matchCount: matchesForTeamOnNight(matches, teamId, night, timezone)
        .length,
      players,
    };
  });

  return { timezone, nights, night, teams };
}

/** How a person is identified within one team, account or not. */
function memberKey(m: { userId: string | null; name: string }): string {
  return m.userId ?? `n:${m.name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/**
 * One team's roster, from both places a player can come from.
 *
 * `team_members` holds people with accounts. `free_agents.placed_team_id` holds
 * everyone the organizer drafted — and in a drafted league most of those have
 * no account at all, so they never reach team_members. Neither source is
 * complete on its own; a 2s league is all members, Big Shoots is all drafted.
 *
 * Members first (they claimed a place themselves), then drafted players in
 * draft order, deduplicated for the free agent who does have an account and
 * therefore appears in both.
 */
function teamRoster(
  members: RosterMember[],
  drafted: { userId: string | null; name: string }[],
): { userId: string | null; name: string }[] {
  const out: { userId: string | null; name: string }[] = [];
  const seen = new Set<string>();
  for (const m of [...members, ...drafted]) {
    const key = memberKey(m);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ userId: m.userId, name: m.name });
  }
  return out;
}
