import { createClient } from "@/lib/supabase/server";
import type { Sport } from "@/lib/formats";

export interface TournamentSummary {
  id: string;
  name: string;
  slug: string;
  sport: Sport;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

export interface Division {
  id: string;
  name: string;
  tierOrder: number;
}

export interface TournamentTeam {
  id: string;
  name: string;
  divisionId: string | null;
  seed: number | null;
  captainUserId: string | null;
  invite: { token: string; email: string } | null;
}

export interface TournamentDetail {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  sport: Sport;
  status: string;
  startDate: string | null;
  endDate: string | null;
  venue: string | null;
  timezone: string;
  poolSize: number;
  registrationDeadline: string | null;
  divisions: Division[];
  teams: TournamentTeam[];
}

export interface PublicTournament {
  id: string;
  name: string;
  slug: string;
  sport: Sport;
  venue: string | null;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  registrationDeadline: string | null;
  registrationOpen: boolean;
  divisions: Division[];
  teams: { id: string; name: string; divisionId: string | null }[];
}

export async function getOrgTournaments(
  orgId: string,
): Promise<TournamentSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("competitions")
    .select("id, name, slug, sport, status, start_date, end_date")
    .eq("org_id", orgId)
    .eq("type", "tournament")
    .order("created_at", { ascending: false });
  return (data as TournamentSummary[] | null) ?? [];
}

async function loadDivisions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitionId: string,
): Promise<Division[]> {
  const { data } = await supabase
    .from("divisions")
    .select("id, name, tier_order")
    .eq("competition_id", competitionId)
    .order("tier_order", { ascending: true });
  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    tierOrder: d.tier_order,
  }));
}

export async function getTournamentDetail(
  tournamentId: string,
): Promise<TournamentDetail | null> {
  const supabase = await createClient();

  const { data: t } = await supabase
    .from("competitions")
    .select(
      "id, org_id, name, slug, sport, status, start_date, end_date, venue, timezone",
    )
    .eq("id", tournamentId)
    .eq("type", "tournament")
    .single();
  if (!t) return null;

  const { data: settings } = await supabase
    .from("tournament_settings")
    .select("pool_size, registration_deadline")
    .eq("competition_id", tournamentId)
    .single();

  const divisions = await loadDivisions(supabase, tournamentId);

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, division_id, seed, captain_user_id")
    .eq("competition_id", tournamentId)
    .order("created_at", { ascending: true });

  const teamIds = (teams ?? []).map((t) => t.id);
  const { data: invites } = teamIds.length
    ? await supabase
        .from("team_invites")
        .select("team_id, token, email")
        .in("team_id", teamIds)
        .eq("status", "pending")
    : { data: [] };
  const inviteByTeam = new Map(
    (invites ?? []).map((i) => [
      i.team_id as string,
      { token: i.token as string, email: i.email as string },
    ]),
  );

  return {
    id: t.id,
    orgId: t.org_id,
    name: t.name,
    slug: t.slug,
    sport: t.sport as Sport,
    status: t.status,
    startDate: t.start_date,
    endDate: t.end_date,
    venue: t.venue,
    timezone: t.timezone,
    poolSize: settings?.pool_size ?? 4,
    registrationDeadline: settings?.registration_deadline ?? null,
    divisions,
    teams: (teams ?? []).map((tm) => ({
      id: tm.id,
      name: tm.name,
      divisionId: tm.division_id,
      seed: tm.seed,
      captainUserId: tm.captain_user_id,
      invite: inviteByTeam.get(tm.id) ?? null,
    })),
  };
}

export async function getPublicTournament(
  slug: string,
): Promise<PublicTournament | null> {
  const supabase = await createClient();

  const { data: t } = await supabase
    .from("competitions")
    .select(
      "id, name, slug, sport, venue, start_date, end_date, timezone, status",
    )
    .eq("slug", slug)
    .eq("type", "tournament")
    .single();
  if (!t) return null; // not found or private (RLS hides drafts)

  const { data: settings } = await supabase
    .from("tournament_settings")
    .select("registration_deadline")
    .eq("competition_id", t.id)
    .single();

  const divisions = await loadDivisions(supabase, t.id);

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, division_id")
    .eq("competition_id", t.id)
    .order("name", { ascending: true });

  const deadline = settings?.registration_deadline ?? null;
  const registrationOpen =
    t.status === "open" && (!deadline || new Date(deadline) > new Date());

  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    sport: t.sport as Sport,
    venue: t.venue,
    startDate: t.start_date,
    endDate: t.end_date,
    timezone: t.timezone,
    registrationDeadline: deadline,
    registrationOpen,
    divisions,
    teams: (teams ?? []).map((tm) => ({
      id: tm.id,
      name: tm.name,
      divisionId: tm.division_id,
    })),
  };
}
