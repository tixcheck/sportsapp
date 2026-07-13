import { createClient } from "@/lib/supabase/server";

export interface MyCompetitionMatch {
  id: string;
  scheduledAt: string | null;
  round: number | null;
  court: string | null;
  homeName: string | null;
  awayName: string | null;
}

export interface MyCompetition {
  competitionId: string;
  slug: string;
  name: string;
  type: "league" | "tournament";
  sport: string;
  status: string;
  teamId: string;
  teamName: string;
  memberRole: "captain" | "player";
  teamStatus: "active" | "withdrawn";
  nextMatch: MyCompetitionMatch | null;
  /** Whether the team has any scheduled matches — distinguishes "run's over"
   * (has matches, none upcoming) from "no schedule yet" (no matches). */
  hasMatches: boolean;
}

export interface PendingInvite {
  inviteId: string;
  token: string;
  teamId: string;
  teamName: string;
  role: "captain" | "player";
  competitionId: string;
  competitionName: string;
  competitionSlug: string;
  competitionType: "league" | "tournament";
}

/** Competitions the signed-in user plays in (any team_members role). */
export async function getMyCompetitions(): Promise<MyCompetition[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_competitions");
  return (data ?? []).map(
    (r: Record<string, unknown>): MyCompetition => ({
      competitionId: r.competition_id as string,
      slug: r.slug as string,
      name: r.name as string,
      type: r.type as "league" | "tournament",
      sport: r.sport as string,
      status: r.status as string,
      teamId: r.team_id as string,
      teamName: r.team_name as string,
      memberRole: r.member_role as "captain" | "player",
      teamStatus: r.team_status as "active" | "withdrawn",
      nextMatch: r.next_match_id
        ? {
            id: r.next_match_id as string,
            scheduledAt: (r.next_scheduled_at as string | null) ?? null,
            round: (r.next_round as number | null) ?? null,
            court: (r.next_court as string | null) ?? null,
            homeName: (r.next_home_name as string | null) ?? null,
            awayName: (r.next_away_name as string | null) ?? null,
          }
        : null,
      hasMatches: (r.has_matches as boolean | null) ?? false,
    }),
  );
}

/**
 * Whether the user's run in a competition is over: their team has played its
 * matches with none left, or the competition itself is finished. Used to hide
 * wrapped-up competitions from the dashboard's active list.
 */
export function isCompetitionDone(c: MyCompetition): boolean {
  if (c.status === "completed" || c.status === "cancelled") return true;
  return c.hasMatches && c.nextMatch === null;
}

/** Pending invites addressed to the signed-in user's email (server-matched). */
export async function getMyPendingInvites(): Promise<PendingInvite[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_pending_invites");
  return (data ?? []).map(
    (r: Record<string, unknown>): PendingInvite => ({
      inviteId: r.invite_id as string,
      token: r.token as string,
      teamId: r.team_id as string,
      teamName: r.team_name as string,
      role: r.role as "captain" | "player",
      competitionId: r.competition_id as string,
      competitionName: r.competition_name as string,
      competitionSlug: r.competition_slug as string,
      competitionType: r.competition_type as "league" | "tournament",
    }),
  );
}

/** The public path for a competition, by type. */
export function competitionPath(type: string, slug: string): string {
  return type === "tournament" ? `/t/${slug}` : `/l/${slug}`;
}
