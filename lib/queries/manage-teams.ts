import { createClient } from "@/lib/supabase/server";
import { isCompetitionDone, type MyCompetition } from "@/lib/queries/dashboard";
import {
  getPendingTeamInvites,
  getTeamRoster,
  type PendingTeamInvite,
  type RosterMember,
} from "@/lib/queries/roster";
import { getTeamWaiverSigned } from "@/lib/queries/team-entry";
import { captainTodos, type CaptainTodo } from "@/lib/teams/captain-todos";

export interface ManagedTeam {
  teamId: string;
  teamName: string;
  competitionName: string;
  isPairs: boolean;
  roster: RosterMember[];
  invites: PendingTeamInvite[];
  waiverSigned: string[] | null;
  todos: CaptainTodo[];
}

/**
 * The teams this person captains that are still playing, with what each
 * needs from them, for the dashboard's "Manage my teams" (2026-10-24). Built
 * from the dashboard's own competition list so it costs nothing for players
 * who captain nothing.
 */
export async function getManagedTeams(
  comps: MyCompetition[],
): Promise<ManagedTeam[]> {
  const mine = comps.filter(
    (c) =>
      c.memberRole === "captain" &&
      c.teamStatus !== "withdrawn" &&
      !isCompetitionDone(c),
  );
  if (mine.length === 0) return [];

  const supabase = await createClient();
  const { data: compRows } = await supabase
    .from("competitions")
    .select("id, min_roster_for_entry")
    .in(
      "id",
      mine.map((c) => c.competitionId),
    );
  const minRoster = new Map(
    (compRows ?? []).map((r) => [
      r.id as string,
      (r.min_roster_for_entry as number | null) ?? null,
    ]),
  );

  return Promise.all(
    mine.map(async (c) => {
      const [roster, invites, waiverSigned] = await Promise.all([
        getTeamRoster(c.teamId),
        getPendingTeamInvites(c.teamId),
        getTeamWaiverSigned(c.teamId, c.competitionId),
      ]);
      return {
        teamId: c.teamId,
        teamName: c.teamName,
        competitionName: c.name,
        isPairs: (c.type as string) === "reverse_pairs",
        roster,
        invites,
        waiverSigned,
        todos: captainTodos({
          teamStatus: c.teamStatus,
          roster,
          waiverSigned,
          minRoster: minRoster.get(c.competitionId) ?? null,
          invites,
        }),
      };
    }),
  );
}
