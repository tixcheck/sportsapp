/**
 * Everything a player's home screen needs, in one call.
 *
 * A player opens this app to answer three questions, in this order: when and
 * where is my next game, how did the last one go, and where does that leave us.
 * The old dashboard answered none of them directly — it listed the competitions
 * they belong to and left the rest to a click.
 *
 * The third question is the one worth having. Team apps in this space show a
 * schedule and a results feed; almost none show a league table, because most of
 * them are built for a single team rather than a competition. We already
 * compute standings properly, so the player's own position is the cheapest
 * genuinely useful thing on the page.
 */

import { createClient } from "@/lib/supabase/server";
import { loadStandings } from "@/lib/standings/compute";
import { getMyMatches, type MyMatch } from "@/lib/queries/my-matches";

export interface PlayerStandingRow {
  competitionId: string;
  competitionName: string;
  competitionType: "league" | "tournament" | string;
  slug: string;
  teamId: string;
  teamName: string;
  /** 1-based place in the table; null before anything is played. */
  position: number | null;
  teamsInTable: number;
  played: number;
  won: number;
  lost: number;
  /** Points for minus against, across the season. */
  differential: number;
  /** True when every one of this team's games has been played. */
  seasonDone: boolean;
}

/**
 * A match seen from one player's side.
 *
 * `MyMatch` names both teams and leaves it to the caller to work out which one
 * is yours — fine for a list of fixtures, useless for "vs Shane/Sam", which is
 * how a player reads their own schedule.
 */
export interface PlayerMatch extends MyMatch {
  /** The team this player is on, when they're playing rather than reffing. */
  myTeamName: string | null;
  /** Who they're up against. Both names for a game they're only reffing. */
  opponentName: string;
  /** How it went. Null while it's unplayed. */
  result: "won" | "lost" | "tied" | null;
  /** Sets won by this player's team, then the opponent's. */
  score: [number, number] | null;
}

export interface PlayerHome {
  /** The very next game they play or ref. Null when nothing is scheduled. */
  next: PlayerMatch | null;
  /** Everything after that, soonest first. */
  upcoming: PlayerMatch[];
  /** Finished games, most recent first. */
  recent: PlayerMatch[];
  /** Where each of their teams sits. */
  standings: PlayerStandingRow[];
}

/** Sortable key for a match: real time if it has one, else round then court. */
function whenKey(m: MyMatch): number {
  if (m.scheduledAt) return new Date(m.scheduledAt).getTime();
  // No time on the fixture — keep it after everything dated, ordered by round.
  return Number.MAX_SAFE_INTEGER - 1_000_000 + (m.round ?? 0) * 1000;
}

export async function getPlayerHome(limit = 6): Promise<PlayerHome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { next: null, upcoming: [], recent: [], standings: [] };
  }

  const matches = await getMyMatches();

  // The teams this user actually plays for, which is what a standings row is
  // about — reffing somebody else's game doesn't put you in their table.
  const { data: memberships } = await supabase
    .from("team_members")
    .select("team_id, teams(id, name, competition_id)")
    .eq("user_id", user.id);

  const myTeams = (memberships ?? [])
    .map((r) => {
      const t = Array.isArray(r.teams) ? r.teams[0] : r.teams;
      return t
        ? {
            teamId: t.id as string,
            teamName: t.name as string,
            competitionId: t.competition_id as string,
          }
        : null;
    })
    .filter(Boolean) as {
    teamId: string;
    teamName: string;
    competitionId: string;
  }[];

  const mineById = new Set(myTeams.map((t) => t.teamId));

  /** Turn a fixture into this player's view of it. */
  const mine = (m: MyMatch): PlayerMatch => {
    const iAmHome = !!m.homeTeamId && mineById.has(m.homeTeamId);
    const iAmAway = !!m.awayTeamId && mineById.has(m.awayTeamId);
    const playing = iAmHome || iAmAway;

    let sw = 0;
    let ow = 0;
    for (const s of m.sets) {
      const [me, them] = iAmAway ? [s.away, s.home] : [s.home, s.away];
      if (me > them) sw += 1;
      else if (them > me) ow += 1;
    }
    const decided = m.status === "completed" && m.sets.length > 0;

    return {
      ...m,
      myTeamName: playing ? (iAmHome ? m.homeTeamName : m.awayTeamName) : null,
      opponentName: playing
        ? iAmHome
          ? m.awayTeamName
          : m.homeTeamName
        : `${m.homeTeamName} v ${m.awayTeamName}`,
      // Only a game they PLAYED has a result for them; reffing one has none.
      result:
        decided && playing
          ? sw > ow
            ? "won"
            : ow > sw
              ? "lost"
              : "tied"
          : null,
      score: decided ? [sw, ow] : null,
    };
  };

  const done = matches
    .filter((m) => m.status === "completed" && m.sets.length > 0)
    .sort((a, b) => whenKey(b) - whenKey(a))
    .map(mine);
  const ahead = matches
    .filter((m) => m.status !== "completed")
    .sort((a, b) => whenKey(a) - whenKey(b))
    .map(mine);

  const compIds = [...new Set(myTeams.map((t) => t.competitionId))];
  const { data: comps } = compIds.length
    ? await supabase
        .from("competitions")
        .select("id, name, type, slug, status")
        .in("id", compIds)
    : { data: [] as Record<string, unknown>[] };

  const compById = new Map(
    (comps ?? []).map((c) => [c.id as string, c as Record<string, unknown>]),
  );

  // One standings load per competition. A player belongs to a handful, so this
  // is a few queries rather than a fan-out worth caching.
  const standings: PlayerStandingRow[] = [];
  for (const compId of compIds) {
    const comp = compById.get(compId);
    // A competition the organizer finished still shows — a final table is
    // exactly the thing a player wants to look back at.
    if (!comp) continue;

    const groups = await loadStandings(supabase, compId);
    const rows = groups.flatMap((g) => g.rows.filter((r) => !r.withdrawn));

    for (const team of myTeams.filter((t) => t.competitionId === compId)) {
      const i = rows.findIndex((r) => r.teamId === team.teamId);
      if (i === -1) continue;
      const row = rows[i];
      const played = row.mw + row.ml + (row.mt ?? 0);
      standings.push({
        competitionId: compId,
        competitionName: comp.name as string,
        competitionType: comp.type as string,
        slug: comp.slug as string,
        teamId: team.teamId,
        teamName: team.teamName,
        position: played > 0 ? i + 1 : null,
        teamsInTable: rows.length,
        played,
        won: row.mw,
        lost: row.ml,
        differential: row.pf - row.pa,
        seasonDone: !ahead.some(
          (m) =>
            m.competitionId === compId &&
            (m.homeTeamId === team.teamId || m.awayTeamId === team.teamId),
        ),
      });
    }
  }

  // Best-placed first: a player in two leagues leads with the one going well.
  standings.sort((a, b) => (a.position ?? 99) - (b.position ?? 99));

  return {
    next: ahead[0] ?? null,
    upcoming: ahead.slice(1, 1 + limit),
    recent: done.slice(0, limit),
    standings,
  };
}
