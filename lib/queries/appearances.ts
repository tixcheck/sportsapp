import { createClient } from "@/lib/supabase/server";
import {
  identityKey,
  partnershipCounts,
  type Appearance,
} from "@/lib/stats/attribution";

/**
 * Reading who played.
 *
 * RLS lets anyone read these — they carry a display name and nothing else, and
 * they feed the public stats tab. Writing is restricted to whoever may enter
 * the score.
 */

export interface LineupPlayer {
  userId: string | null;
  name: string;
  role: "rostered" | "sub";
}

/** The recorded lineup for one team in one match. */
export async function getMatchLineup(
  matchId: string,
  teamId: string,
): Promise<LineupPlayer[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("match_appearances")
    .select("user_id, player_name, role")
    .eq("match_id", matchId)
    .eq("team_id", teamId)
    .order("player_name");

  return (
    (data ?? []) as {
      user_id: string | null;
      player_name: string;
      role: "rostered" | "sub";
    }[]
  ).map((r) => ({ userId: r.user_id, name: r.player_name, role: r.role }));
}

export interface PartnershipRow {
  a: string;
  b: string;
  nights: number;
}

/**
 * How many nights each pair of players has been on the same team.
 *
 * The organizer's goal is "force as many combinations as possible and give
 * people an opportunity to play with everyone", so this counts shared NIGHTS —
 * six games together on one Tuesday is one occasion, not six.
 */
export async function getPartnerships(competitionId: string): Promise<{
  rows: PartnershipRow[];
  players: { key: string; name: string }[];
}> {
  const supabase = await createClient();

  const [{ data: apps }, { data: matches }] = await Promise.all([
    supabase
      .from("match_appearances")
      .select("match_id, team_id, user_id, player_name, role")
      .eq("competition_id", competitionId),
    supabase
      .from("matches")
      .select("id, scheduled_at")
      .eq("competition_id", competitionId),
  ]);

  const appearances: Appearance[] = (
    (apps ?? []) as {
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

  // The night is the calendar date of the match. Good enough here because a
  // league plays on one evening; a tournament spanning midnight would want the
  // venue timezone, which is a problem for whoever builds that.
  const nightOfMatch = new Map<string, string>();
  for (const m of (matches ?? []) as {
    id: string;
    scheduled_at: string | null;
  }[]) {
    if (m.scheduled_at) nightOfMatch.set(m.id, m.scheduled_at.slice(0, 10));
  }

  const nameByKey = new Map<string, string>();
  for (const a of appearances) {
    nameByKey.set(identityKey(a), a.playerName.trim());
  }

  const counts = partnershipCounts(appearances, nightOfMatch);
  const rows: PartnershipRow[] = [...counts.entries()]
    .map(([pair, nights]) => {
      const [a, b] = pair.split("|");
      return { a: nameByKey.get(a) ?? a, b: nameByKey.get(b) ?? b, nights };
    })
    .sort((x, y) => y.nights - x.nights);

  return {
    rows,
    players: [...nameByKey.entries()].map(([key, name]) => ({ key, name })),
  };
}
