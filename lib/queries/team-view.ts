import { createClient } from "@/lib/supabase/server";
import { getMyMatches, type MyMatch } from "@/lib/queries/my-matches";
import { getStandings, type StandingsGroup } from "@/lib/standings/compute";
import { getTeamRosters, type RosterMember } from "@/lib/queries/roster";
import { getLeagueSchedule, type ScheduleMatch } from "@/lib/queries/leagues";
import { getPoolsView } from "@/lib/queries/tournaments";

export interface TeamView {
  team: { id: string; name: string };
  competition: {
    id: string;
    name: string;
    slug: string;
    type: "league" | "tournament";
    timezone: string;
  };
  isMember: boolean;
  isAdmin: boolean;
  /** Member path: the user's own matches for this team (with their actions). */
  myMatches: MyMatch[];
  /** Admin (non-member) read-only path: the team's matches from the schedule. */
  teamSchedule: ScheduleMatch[];
  /** The standings group (pool / whole league) containing this team. */
  standingsGroup: StandingsGroup | null;
  roster: RosterMember[];
}

/**
 * Everything the My-team page needs, composed from existing queries — no new
 * data model. Returns null (→ notFound) unless the viewer is a member of the
 * team OR an admin of its competition.
 */
export async function getTeamView(teamId: string): Promise<TeamView | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, competition_id")
    .eq("id", teamId)
    .single();
  if (!team) return null;

  const { data: comp } = await supabase
    .from("competitions")
    .select("id, name, slug, type, timezone")
    .eq("id", team.competition_id)
    .single();
  if (!comp) return null;

  // Gate: team member OR competition admin.
  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .maybeSingle();
  const isMember = !!membership;
  const { data: adminData } = await supabase.rpc("is_competition_admin", {
    _competition_id: comp.id,
  });
  const isAdmin = adminData === true;
  if (!isMember && !isAdmin) return null;

  const [standingsGroups, rosters] = await Promise.all([
    getStandings(comp.id),
    getTeamRosters(comp.id),
  ]);
  const standingsGroup =
    standingsGroups.find((g) => g.rows.some((r) => r.teamId === teamId)) ??
    null;
  const roster = rosters[teamId] ?? [];

  let myMatches: MyMatch[] = [];
  let teamSchedule: ScheduleMatch[] = [];
  if (isMember) {
    const all = await getMyMatches();
    myMatches = all.filter(
      (m) => m.homeTeamId === teamId || m.awayTeamId === teamId,
    );
  } else {
    const sched =
      comp.type === "tournament"
        ? ((await getPoolsView(comp.id))?.schedule ?? [])
        : await getLeagueSchedule(comp.id);
    teamSchedule = sched.filter(
      (m) =>
        m.homeTeamId === teamId ||
        m.awayTeamId === teamId ||
        m.refTeamId === teamId,
    );
  }

  return {
    team: { id: team.id, name: team.name },
    competition: {
      id: comp.id,
      name: comp.name,
      slug: comp.slug,
      type: comp.type as "league" | "tournament",
      timezone: comp.timezone,
    },
    isMember,
    isAdmin,
    myMatches,
    teamSchedule,
    standingsGroup,
    roster,
  };
}
