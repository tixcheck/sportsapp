import { createClient } from "@/lib/supabase/server";
import type { Sport } from "@/lib/formats";

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
}

export interface LeagueSummary {
  id: string;
  name: string;
  slug: string;
  sport: Sport;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

export interface LeagueTeam {
  id: string;
  name: string;
  captain_user_id: string | null;
  invite: { token: string; email: string; status: string } | null;
}

export interface LeagueDetail {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  sport: Sport;
  status: string;
  startDate: string | null;
  endDate: string | null;
  venue: string | null;
  teams: LeagueTeam[];
  matchCount: number;
}

/** The org if the current user can see it (RLS), else null. */
export async function getOrg(orgId: string): Promise<OrgSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("id", orgId)
    .single();
  return data;
}

export async function getOrgLeagues(orgId: string): Promise<LeagueSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("competitions")
    .select("id, name, slug, sport, status, start_date, end_date")
    .eq("org_id", orgId)
    .eq("type", "league")
    .order("created_at", { ascending: false });
  return (data as LeagueSummary[] | null) ?? [];
}

export async function getLeagueDetail(
  leagueId: string,
): Promise<LeagueDetail | null> {
  const supabase = await createClient();

  const { data: league } = await supabase
    .from("competitions")
    .select(
      "id, org_id, name, slug, sport, status, start_date, end_date, venue",
    )
    .eq("id", leagueId)
    .eq("type", "league")
    .single();
  if (!league) return null;

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, captain_user_id")
    .eq("competition_id", leagueId)
    .order("created_at", { ascending: true });

  const teamIds = (teams ?? []).map((t) => t.id);
  const { data: invites } = teamIds.length
    ? await supabase
        .from("team_invites")
        .select("team_id, token, email, status")
        .in("team_id", teamIds)
        .eq("status", "pending")
    : { data: [] };

  const inviteByTeam = new Map(
    (invites ?? []).map((i) => [
      i.team_id as string,
      {
        token: i.token as string,
        email: i.email as string,
        status: i.status as string,
      },
    ]),
  );

  const { count } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("competition_id", leagueId);

  return {
    id: league.id,
    orgId: league.org_id,
    name: league.name,
    slug: league.slug,
    sport: league.sport as Sport,
    status: league.status,
    startDate: league.start_date,
    endDate: league.end_date,
    venue: league.venue,
    teams: (teams ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      captain_user_id: t.captain_user_id,
      invite: inviteByTeam.get(t.id) ?? null,
    })),
    matchCount: count ?? 0,
  };
}
