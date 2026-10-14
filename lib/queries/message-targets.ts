import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";
import { teamGroupsFromGames, type TeamGroup } from "@/lib/email/team-groups";

export type MessageTeam = { id: string; name: string };

/** How far ahead "everyone at this gym on this night" is offered. */
const GROUP_DAYS = 14;

/**
 * The teams an organizer can single out in a league message, and the gym
 * nights coming up, for the compose dialog (0172). Same statuses the send
 * action mails: a withdrawn or unpaid team isn't offered.
 */
export async function getMessageTargets(
  competitionId: string,
  timezone: string | null,
): Promise<{ teams: MessageTeam[]; groups: TeamGroup[] }> {
  const supabase = await createClient();
  const zone = timezone ?? "America/Toronto";
  const now = DateTime.now().setZone(zone).startOf("day");

  const [{ data: teams }, { data: games }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name")
      .eq("competition_id", competitionId)
      .in("status", ["active", "pending_waiver"])
      .order("name"),
    supabase
      .from("matches")
      .select("scheduled_at, home_team_id, away_team_id, venues(name)")
      .eq("competition_id", competitionId)
      .gte("scheduled_at", now.toUTC().toISO()!)
      .lt("scheduled_at", now.plus({ days: GROUP_DAYS }).toUTC().toISO()!),
  ]);

  const rows = (games ?? []) as unknown as {
    scheduled_at: string;
    home_team_id: string | null;
    away_team_id: string | null;
    venues: { name: string } | null;
  }[];
  const groups = teamGroupsFromGames(
    rows.map((g) => ({
      venue: g.venues?.name ?? null,
      date: DateTime.fromISO(g.scheduled_at).setZone(zone).toISODate()!,
      homeTeamId: g.home_team_id,
      awayTeamId: g.away_team_id,
    })),
  );
  const offered = (teams ?? []) as MessageTeam[];
  const ids = new Set(offered.map((t) => t.id));
  return {
    teams: offered,
    groups: groups
      .map((g) => ({ ...g, teamIds: g.teamIds.filter((id) => ids.has(id)) }))
      .filter((g) => g.teamIds.length > 0),
  };
}
