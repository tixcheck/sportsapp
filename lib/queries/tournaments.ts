import { createClient } from "@/lib/supabase/server";
import type { Sport } from "@/lib/formats";
import type { FormatTemplate } from "@/lib/tournament-formats";
import type { ScheduleMatch } from "@/lib/queries/leagues";

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
  status: "active" | "withdrawn";
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
  formatTemplate: FormatTemplate;
  registrationDeadline: string | null;
  scoring: {
    allowCaptainEntry: boolean;
    allowRefEntry: boolean;
    allowOrganizerEntry: boolean;
    requireConfirmation: boolean;
  };
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
      "id, org_id, name, slug, sport, status, start_date, end_date, venue, timezone, allow_captain_entry, allow_ref_entry, allow_organizer_entry, require_confirmation",
    )
    .eq("id", tournamentId)
    .eq("type", "tournament")
    .single();
  if (!t) return null;

  const { data: settings } = await supabase
    .from("tournament_settings")
    .select("pool_size, format_template, registration_deadline")
    .eq("competition_id", tournamentId)
    .single();

  const divisions = await loadDivisions(supabase, tournamentId);

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, division_id, seed, status, captain_user_id")
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
    formatTemplate: (settings?.format_template ?? "single") as FormatTemplate,
    registrationDeadline: settings?.registration_deadline ?? null,
    scoring: {
      allowCaptainEntry: t.allow_captain_entry,
      allowRefEntry: t.allow_ref_entry,
      allowOrganizerEntry: t.allow_organizer_entry,
      requireConfirmation: t.require_confirmation,
    },
    divisions,
    teams: (teams ?? []).map((tm) => ({
      id: tm.id,
      name: tm.name,
      divisionId: tm.division_id,
      seed: tm.seed,
      status: tm.status as "active" | "withdrawn",
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

// --- pools view (admin + public) -------------------------------------------

export interface PoolWithTeams {
  id: string;
  name: string;
  court: string | null;
  /** v1 drop-a-game: each team drops one game from its own standings. */
  needsDrop: boolean;
  teams: { id: string; name: string; seed: number | null }[];
  matches: ScheduleMatch[];
}

export interface DivisionPools {
  division: Division;
  pools: PoolWithTeams[];
}

export interface PoolsView {
  timezone: string;
  hasPools: boolean;
  divisions: DivisionPools[];
  schedule: ScheduleMatch[];
}

/** Pools + pool-play schedule grouped by division (RLS-aware). */
export async function getPoolsView(
  competitionId: string,
): Promise<PoolsView | null> {
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from("competitions")
    .select("timezone")
    .eq("id", competitionId)
    .single();
  if (!comp) return null;

  const divisions = await loadDivisions(supabase, competitionId);

  const { data: pools } = await supabase
    .from("pools")
    .select("id, name, division_id, sort_order, needs_drop")
    .eq("competition_id", competitionId)
    .order("sort_order", { ascending: true });

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, seed, pool_id")
    .eq("competition_id", competitionId);
  const nameById = new Map(
    (teams ?? []).map((t) => [t.id as string, t.name as string]),
  );

  const { data: matches } = await supabase
    .from("matches")
    .select(
      "id, round, scheduled_at, court, status, home_team_id, away_team_id, ref_team_id, pool_id, is_abnormal",
    )
    .eq("competition_id", competitionId)
    .order("scheduled_at", { ascending: true })
    .order("round", { ascending: true });

  const matchIds = (matches ?? []).map((m) => m.id);
  const { data: setRows } = matchIds.length
    ? await supabase
        .from("sets")
        .select("match_id, home_score, away_score")
        .in("match_id", matchIds)
        .order("set_number", { ascending: true })
    : {
        data: [] as {
          match_id: string;
          home_score: number;
          away_score: number;
        }[],
      };
  const setsByMatch = new Map<string, { home: number; away: number }[]>();
  for (const s of setRows ?? []) {
    const list = setsByMatch.get(s.match_id) ?? [];
    list.push({ home: s.home_score, away: s.away_score });
    setsByMatch.set(s.match_id, list);
  }

  const toScheduleMatch = (m: {
    id: string;
    round: number | null;
    scheduled_at: string | null;
    court: string | null;
    status: string;
    home_team_id: string | null;
    away_team_id: string | null;
    ref_team_id: string | null;
    is_abnormal?: boolean;
  }): ScheduleMatch => ({
    id: m.id,
    round: m.round,
    scheduledAt: m.scheduled_at,
    court: m.court,
    status: m.status,
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
    homeTeamName: m.home_team_id
      ? (nameById.get(m.home_team_id) ?? "TBD")
      : "TBD",
    awayTeamName: m.away_team_id
      ? (nameById.get(m.away_team_id) ?? "TBD")
      : "TBD",
    refTeamId: m.ref_team_id,
    refTeamName: m.ref_team_id ? (nameById.get(m.ref_team_id) ?? null) : null,
    isAbnormal: m.is_abnormal === true,
    sets: setsByMatch.get(m.id) ?? [],
  });

  const matchesByPool = new Map<string, ScheduleMatch[]>();
  const schedule: ScheduleMatch[] = [];
  for (const m of matches ?? []) {
    const sm = toScheduleMatch(m);
    schedule.push(sm);
    if (m.pool_id) {
      const list = matchesByPool.get(m.pool_id) ?? [];
      list.push(sm);
      matchesByPool.set(m.pool_id, list);
    }
  }

  const teamsByPool = new Map<
    string,
    { id: string; name: string; seed: number | null }[]
  >();
  for (const t of teams ?? []) {
    if (!t.pool_id) continue;
    const list = teamsByPool.get(t.pool_id) ?? [];
    list.push({ id: t.id, name: t.name, seed: t.seed });
    teamsByPool.set(t.pool_id, list);
  }
  for (const list of teamsByPool.values()) {
    list.sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999));
  }

  const divisionPools: DivisionPools[] = divisions.map((d) => ({
    division: d,
    pools: (pools ?? [])
      .filter((p) => p.division_id === d.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        court: (matchesByPool.get(p.id) ?? [])[0]?.court ?? null,
        needsDrop: p.needs_drop === true,
        teams: teamsByPool.get(p.id) ?? [],
        matches: matchesByPool.get(p.id) ?? [],
      })),
  }));

  return {
    timezone: comp.timezone,
    hasPools: (pools?.length ?? 0) > 0,
    divisions: divisionPools,
    schedule,
  };
}
