import { createClient } from "@/lib/supabase/server";
import type { Sport } from "@/lib/formats";
import type { LeagueCourt, MatchFormat, WeeklySlot } from "@/lib/db/schema";

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
  status: "active" | "withdrawn" | "pending_payment";
  captain_user_id: string | null;
  /** The tier (division) this team is sorted into, or null (untiered/unsorted). */
  divisionId: string | null;
  invite: { token: string; email: string; status: string } | null;
}

export interface LeagueTier {
  id: string;
  name: string;
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
  timezone: string;
  /** Editable settings (for the Edit-settings form). */
  matchFormat: MatchFormat;
  roundsPerTeam: number;
  gamesPerTeam: number | null;
  /** Games each team plays per week (default 1; 2 = two games a night). */
  gamesPerWeek: number;
  /** Minutes each game occupies — spacing + rest gaps (default 45). */
  minutesPerGame: number;
  /** Standings tiebreaker hierarchy — "ova" ratios or point "differential". */
  tiebreaker: "ova" | "differential";
  /** Pro-rate short-handed (mid-season) teams to the full slate for ranking. */
  projectShortTeams: boolean;
  /** The league's specific courts (+ prime flags); null = plain 1…N numbering. */
  courtList: LeagueCourt[] | null;
  courts: number;
  slotDayOfWeek: number;
  slotStartTime: string;
  blackoutDates: string[];
  scoring: {
    allowCaptainEntry: boolean;
    allowRefEntry: boolean;
    allowOrganizerEntry: boolean;
    requireConfirmation: boolean;
  };
  teams: LeagueTeam[];
  /** Skill tiers (divisions). Empty = untiered league. Ordered by tier. */
  tiers: LeagueTier[];
  /** Public self-registration state (organizer controls). */
  registrationOpen: boolean;
  registrationDeadline: string | null;
  matchCount: number;
}

export interface ScheduleMatch {
  id: string;
  round: number | null;
  scheduledAt: string | null;
  court: string | null;
  status: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  refTeamId: string | null;
  refTeamName: string | null;
  isAbnormal: boolean;
  /**
   * The tier this game belongs to. Matches don't store a division — teams do —
   * so it's read off the home team (both sides of a tiered game share a tier).
   * Absent on an untiered league, a bracket game, or a tournament match.
   */
  divisionId?: string | null;
  divisionName?: string | null;
  /** Position of that tier in the ladder, 0 = top. */
  tierOrder?: number | null;
  /** Set scores in order, present once any have been recorded. */
  sets: { home: number; away: number }[];
}

export interface PublicLeague {
  id: string;
  name: string;
  slug: string;
  sport: Sport;
  venue: string | null;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  /** Match format — drives the standings ranking legend. */
  matchFormat: MatchFormat;
  /** Standings tiebreaker hierarchy — "ova" ratios or point "differential". */
  tiebreaker: "ova" | "differential";
  /** Skill tiers (divisions) teams can register into. Empty = untiered. */
  tiers: LeagueTier[];
  /** Whether self-registration is currently accepting teams (open + in window). */
  registrationOpen: boolean;
  /** Registration close datetime (ISO), when set. */
  registrationDeadline: string | null;
  /** `divisionId` groups the Teams tab by tier, the way the schedule is. */
  teams: { id: string; name: string; divisionId: string | null }[];
  schedule: ScheduleMatch[];
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
      "id, org_id, name, slug, sport, status, start_date, end_date, venue, timezone, match_format, allow_captain_entry, allow_ref_entry, allow_organizer_entry, require_confirmation",
    )
    .eq("id", leagueId)
    .eq("type", "league")
    .single();
  if (!league) return null;

  const { data: settings } = await supabase
    .from("league_settings")
    .select(
      "weekly_slots, rounds_per_team, games_per_team, blackout_dates, tiebreaker, court_list, games_per_week, minutes_per_game",
    )
    .eq("competition_id", leagueId)
    .maybeSingle();
  const slot = (settings?.weekly_slots as WeeklySlot[] | null)?.[0];

  // Registration columns are read separately so that — before migration 0057
  // lands — a missing-column error can't blank out the core settings above.
  const { data: regRow } = await supabase
    .from("league_settings")
    .select("registration_open, registration_deadline")
    .eq("competition_id", leagueId)
    .maybeSingle();

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, status, captain_user_id, division_id")
    .eq("competition_id", leagueId)
    .order("created_at", { ascending: true });

  const { data: divisionRows } = await supabase
    .from("divisions")
    .select("id, name")
    .eq("competition_id", leagueId)
    .order("tier_order", { ascending: true });

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
    timezone: league.timezone,
    matchFormat: league.match_format as MatchFormat,
    roundsPerTeam: settings?.rounds_per_team ?? 1,
    gamesPerTeam: (settings?.games_per_team as number | null) ?? null,
    gamesPerWeek: (settings?.games_per_week as number | null) ?? 1,
    minutesPerGame: (settings?.minutes_per_game as number | null) ?? 45,
    tiebreaker: ((settings?.tiebreaker as string | null) ?? "").startsWith(
      "differential",
    )
      ? "differential"
      : "ova",
    projectShortTeams: ((settings?.tiebreaker as string | null) ?? "").endsWith(
      "_projected",
    ),
    courtList: (settings?.court_list as LeagueCourt[] | null) ?? null,
    courts: slot?.courts ?? 2,
    slotDayOfWeek: slot?.dayOfWeek ?? 2,
    slotStartTime: slot?.startTime ?? "19:00",
    blackoutDates: (settings?.blackout_dates as string[] | null) ?? [],
    scoring: {
      allowCaptainEntry: league.allow_captain_entry,
      allowRefEntry: league.allow_ref_entry,
      allowOrganizerEntry: league.allow_organizer_entry,
      requireConfirmation: league.require_confirmation,
    },
    teams: (teams ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status as "active" | "withdrawn" | "pending_payment",
      captain_user_id: t.captain_user_id,
      divisionId: (t.division_id as string | null) ?? null,
      invite: inviteByTeam.get(t.id) ?? null,
    })),
    tiers: (divisionRows ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
    })),
    registrationOpen: (regRow?.registration_open as boolean | null) === true,
    registrationDeadline:
      (regRow?.registration_deadline as string | null) ?? null,
    matchCount: count ?? 0,
  };
}

async function loadSchedule(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leagueId: string,
): Promise<ScheduleMatch[]> {
  const [{ data: teams }, { data: divisions }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, division_id")
      .eq("competition_id", leagueId)
      // Unpaid teams are not entrants yet (migration 0066).
      .neq("status", "pending_payment"),
    supabase
      .from("divisions")
      .select("id, name, tier_order")
      .eq("competition_id", leagueId),
  ]);
  const nameById = new Map(
    (teams ?? []).map((t) => [t.id as string, t.name as string]),
  );
  const divisionByTeam = new Map(
    (teams ?? []).map((t) => [
      t.id as string,
      (t.division_id as string | null) ?? null,
    ]),
  );
  const division = new Map(
    (divisions ?? []).map((d) => [
      d.id as string,
      { name: d.name as string, tierOrder: d.tier_order as number },
    ]),
  );

  const { data: matches } = await supabase
    .from("matches")
    .select(
      "id, round, scheduled_at, court, status, home_team_id, away_team_id, ref_team_id, is_abnormal",
    )
    .eq("competition_id", leagueId)
    .order("scheduled_at", { ascending: true })
    .order("round", { ascending: true });

  const matchIds = (matches ?? []).map((m) => m.id);
  const { data: sets } = matchIds.length
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
  for (const s of sets ?? []) {
    const list = setsByMatch.get(s.match_id) ?? [];
    list.push({ home: s.home_score, away: s.away_score });
    setsByMatch.set(s.match_id, list);
  }

  return (matches ?? []).map((m) => {
    // Prefer the home team's tier; fall back to the away team's so a game with
    // a TBD home side still lands in the right block.
    const divisionId =
      (m.home_team_id ? divisionByTeam.get(m.home_team_id) : null) ??
      (m.away_team_id ? divisionByTeam.get(m.away_team_id) : null) ??
      null;
    const div = divisionId ? division.get(divisionId) : undefined;
    return {
      id: m.id,
      round: m.round,
      scheduledAt: m.scheduled_at,
      court: m.court,
      status: m.status,
      divisionId,
      divisionName: div?.name ?? null,
      tierOrder: div?.tierOrder ?? null,
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
    };
  });
}

export async function getLeagueSchedule(
  leagueId: string,
): Promise<ScheduleMatch[]> {
  const supabase = await createClient();
  return loadSchedule(supabase, leagueId);
}

/** Public (RLS-gated) league view by slug. Returns null unless published. */
export async function getPublicLeague(
  slug: string,
): Promise<PublicLeague | null> {
  const supabase = await createClient();
  const { data: league } = await supabase
    .from("competitions")
    .select(
      "id, name, slug, sport, venue, start_date, end_date, timezone, match_format",
    )
    .eq("slug", slug)
    .eq("type", "league")
    .single();
  if (!league) return null; // not found, or private (RLS hides drafts)

  const [{ data: teams }, { data: settings }, { data: divisionRows }] =
    await Promise.all([
      supabase
        .from("teams")
        .select("id, name, division_id")
        .eq("competition_id", league.id)
        // Unpaid teams are not entrants yet (migration 0066).
        .neq("status", "pending_payment")
        .order("name", { ascending: true }),
      supabase
        .from("league_settings")
        .select("tiebreaker")
        .eq("competition_id", league.id)
        .single(),
      supabase
        .from("divisions")
        .select("id, name")
        .eq("competition_id", league.id)
        .order("tier_order", { ascending: true }),
    ]);

  // Registration columns read separately (see getLeagueDetail) so a pre-0057
  // missing-column error can't take down the tiebreaker read above.
  const { data: regRow } = await supabase
    .from("league_settings")
    .select("registration_open, registration_deadline")
    .eq("competition_id", league.id)
    .maybeSingle();

  const schedule = await loadSchedule(supabase, league.id);

  const deadline = (regRow?.registration_deadline as string | null) ?? null;
  const registrationOpen =
    (regRow?.registration_open as boolean | null) === true &&
    (!deadline || new Date(deadline) > new Date());

  return {
    id: league.id,
    name: league.name,
    slug: league.slug,
    sport: league.sport as Sport,
    venue: league.venue,
    startDate: league.start_date,
    endDate: league.end_date,
    timezone: league.timezone,
    matchFormat: league.match_format as MatchFormat,
    tiebreaker: ((settings?.tiebreaker as string | null) ?? "").startsWith(
      "differential",
    )
      ? "differential"
      : "ova",
    tiers: (divisionRows ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
    })),
    registrationOpen,
    registrationDeadline: deadline,
    teams: (teams ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      divisionId: (t.division_id as string | null) ?? null,
    })),
    schedule,
  };
}
