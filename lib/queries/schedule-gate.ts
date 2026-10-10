import { createClient } from "@/lib/supabase/server";

/**
 * Whether this viewer may see a league's schedule (0161), and — when they
 * can't — what their own teams still need.
 *
 * The database is what actually withholds the games (`can_view_schedule` on
 * the read policies); this only tells the page why the schedule is empty, so
 * a player sees "2 more players to join" rather than a blank tab.
 */
export interface ScheduleGateTeam {
  name: string;
  joined: number;
  minRoster: number | null;
  unsigned: number;
  invited: number;
  /** null = this team is ready. */
  blocked: "roster" | "waiver" | null;
}

export interface ScheduleGate {
  /** The league shows its schedule to ready teams only. */
  gated: boolean;
  /** This viewer can see it. */
  canView: boolean;
  /** The signed-in viewer's own teams in the league. */
  myTeams: ScheduleGateTeam[];
  signedIn: boolean;
}

export async function getScheduleGate(
  competitionId: string,
): Promise<ScheduleGate> {
  const supabase = await createClient();
  const [{ data: comp }, { data: canView }] = await Promise.all([
    supabase
      .from("competitions")
      .select("schedule_ready_teams_only")
      .eq("id", competitionId)
      .maybeSingle(),
    supabase.rpc("can_view_schedule", { _competition_id: competitionId }),
  ]);
  const gated = comp?.schedule_ready_teams_only === true;
  if (!gated) {
    return { gated: false, canView: true, myTeams: [], signedIn: false };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: rows } = user
    ? await supabase.rpc("my_schedule_gate", { _competition_id: competitionId })
    : { data: [] };
  return {
    gated,
    signedIn: !!user,
    canView: canView === true,
    myTeams: (
      (rows ?? []) as {
        team_name: string;
        joined: number;
        min_roster: number | null;
        unsigned: number;
        invited: number;
        blocked: string | null;
      }[]
    ).map((r) => ({
      name: r.team_name,
      joined: r.joined,
      minRoster: r.min_roster,
      unsigned: r.unsigned,
      invited: r.invited,
      blocked:
        r.blocked === "roster" || r.blocked === "waiver" ? r.blocked : null,
    })),
  };
}
