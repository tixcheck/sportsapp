import { createClient } from "@/lib/supabase/server";
import {
  identityKey,
  partnershipCounts,
  type Appearance,
} from "@/lib/stats/attribution";
import { nightOf } from "@/lib/stats/night-lineup";
import { buildPartnerGrid, type PartnerGrid } from "@/lib/stats/partner-grid";
import { getFullTimeRoster } from "@/lib/queries/full-time-roster";
import { isFullTime } from "@/lib/stats/roster-split";

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

/**
 * How many nights each pair of players has been on the same team.
 *
 * The organizer's goal is "force as many combinations as possible and give
 * people an opportunity to play with everyone", so this counts shared NIGHTS —
 * six games together on one Friday is one occasion, not six.
 *
 * A night is the date in the COMPETITION's timezone. The first version took
 * the UTC date instead, and a Toronto league's 8:15 PM round is already past
 * midnight UTC: 100 of Big Shoots' 198 games landed on the wrong night, every
 * Friday split in two, and anyone in the last round would have been counted
 * twice with the same teammates.
 */
export async function getPartnerGrid(
  competitionId: string,
): Promise<PartnerGrid> {
  const supabase = await createClient();

  const [{ data: apps }, { data: matches }, { data: comp }] = await Promise.all(
    [
      supabase
        .from("match_appearances")
        .select("match_id, team_id, user_id, player_name, role")
        .eq("competition_id", competitionId),
      supabase
        .from("matches")
        .select("id, scheduled_at")
        .eq("competition_id", competitionId),
      supabase
        .from("competitions")
        .select("timezone")
        .eq("id", competitionId)
        .maybeSingle(),
    ],
  );

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

  const timezone =
    (comp as { timezone: string | null } | null)?.timezone ?? "America/Toronto";
  const nightOfMatch = new Map<string, string>();
  for (const m of (matches ?? []) as {
    id: string;
    scheduled_at: string | null;
  }[]) {
    const night = nightOf(m.scheduled_at, timezone);
    if (night) nightOfMatch.set(m.id, night);
  }

  // Subs are excluded, on the organizer's instruction: "for the who has played
  // with whom chart, don't want it to include subs, just need the combos for
  // active players." The grid exists to spread the DRAFT pool across each
  // other, and a one-night stand-in is noise in both directions — a column of
  // their own, and a "never played together" pair that will never be fixed.
  //
  // Membership, not `role`: a drafted player who turned out for another team
  // that night is still one of the league's own. See `roster-split.ts`.
  const rosterKeys = await getFullTimeRoster(competitionId);
  const counted =
    rosterKeys.size === 0
      ? appearances
      : appearances.filter((a) =>
          isFullTime({ userId: a.userId, name: a.playerName }, rosterKeys),
        );

  const nameByKey = new Map<string, string>();
  for (const a of counted) {
    nameByKey.set(identityKey(a), a.playerName.trim());
  }

  return buildPartnerGrid(
    [...nameByKey.entries()].map(([key, name]) => ({ key, name })),
    partnershipCounts(counted, nightOfMatch),
  );
}
