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
  teamStatus: "active" | "withdrawn" | "pending_payment";
  nextMatch: MyCompetitionMatch | null;
  /** Whether the team has any scheduled matches — distinguishes "run's over"
   * (has matches, none upcoming) from "no schedule yet" (no matches). */
  hasMatches: boolean;
  /**
   * The team's latest match time, played or not. Null when the schedule carries
   * no times. Used to tell a season waiting on a playoff draw from one that
   * genuinely finished (migration 0095).
   */
  lastMatchAt: string | null;
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

/**
 * Auto-accept any team invites addressed to the signed-in user's email — so a
 * new sign-up (or an existing user just added by an organizer) sees their
 * leagues/tournaments immediately, with no separate "accept" step. Idempotent
 * and a no-op when there's nothing pending.
 */
export async function acceptPendingInvites(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("accept_pending_invites");
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
      teamStatus: r.team_status as "active" | "withdrawn" | "pending_payment",
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
      lastMatchAt: (r.last_match_at as string | null) ?? null,
    }),
  );
}

/**
 * How long a competition with nothing left to play stays on the dashboard.
 *
 * Long enough to cover the gap between a season ending and its playoff bracket
 * being drawn, which is days to a couple of weeks and is the whole reason this
 * grace period exists. Short enough that last spring's league is not still
 * sitting there in the autumn.
 */
export const WRAP_UP_GRACE_DAYS = 21;

/**
 * Whether the user's run in a competition is over. Used to hide wrapped-up
 * competitions from the dashboard's active list.
 *
 * "No upcoming match" is NOT enough on its own, because the question is asked
 * of ONE TEAM's fixtures, not the competition's. Two live situations look
 * exactly like a finished season:
 *
 *  - The whole league is between phases: the last round-robin game has been
 *    scored and the playoff bracket has not been generated yet.
 *  - A single team has simply played all of its fixtures while the rest of the
 *    league plays on — which happens mid-season, every season, whenever the
 *    draw is not perfectly even.
 *
 * In both the competition is live, and in both the standings are what everyone
 * wants to look at — they decide the playoff seeding. Instead the league
 * vanished from those players' dashboards, taking the links to their team and
 * the standings with it.
 *
 * So an unfinished competition with nothing to play is given a grace period,
 * measured from its last match. A competition the organizer has actually marked
 * completed still drops off at once, because that is an explicit statement
 * rather than an inference.
 */
export function isCompetitionDone(
  c: MyCompetition,
  now: Date = new Date(),
): boolean {
  if (c.status === "completed" || c.status === "cancelled") return true;
  if (!c.hasMatches || c.nextMatch !== null) return false;

  // No times on the schedule at all: there is no evidence it is over, and
  // guessing wrong hides a live competition. Keep it.
  if (!c.lastMatchAt) return false;

  const last = new Date(c.lastMatchAt).getTime();
  if (Number.isNaN(last)) return false;
  const days = (now.getTime() - last) / 86_400_000;
  return days > WRAP_UP_GRACE_DAYS;
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
