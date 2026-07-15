import { createClient } from "@/lib/supabase/server";
import { resolveMatchFormat } from "@/lib/scheduler/pools";
import { getBracketPreview } from "@/lib/queries/bracket";
import { isFutureMatch } from "@/lib/scoring/lock";
import type { MatchFormat } from "@/lib/db/schema";

export type ConfirmationState = "none" | "pending" | "disputed" | "final";

export interface MyMatch {
  id: string;
  competitionId: string;
  competitionName: string;
  competitionType: "league" | "tournament";
  slug: string;
  timezone: string;
  round: number | null;
  court: string | null;
  scheduledAt: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  refTeamId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  refTeamName: string | null;
  matchFormat: MatchFormat;
  sets: { home: number; away: number }[];
  status: string;
  state: ConfirmationState;
  role: "play" | "ref";
  /** Pool (round-robin) vs bracket (playoff) — drives the my-matches sections. */
  phase: "pool" | "bracket";
  canEnter: boolean;
  canConfirm: boolean;
  /** Eligible to score, but the game is in the future — locked until game day. */
  lockedFuture: boolean;
}

/**
 * Matches the current user can act on — as a member of a playing team (any
 * roster member, not just the captain), or as a member of a match's reffing
 * team. Sorted "what's next" by round → court (scheduled times are estimates),
 * completed last.
 */
export async function getMyMatches(): Promise<MyMatch[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: captainTeams } = await supabase
    .from("teams")
    .select("id")
    .eq("captain_user_id", user.id);

  const { data: memberTeams } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id);
  const memberTeamIds = new Set(
    (memberTeams ?? []).map((m) => m.team_id as string),
  );

  // Teams the user plays for: any roster membership, plus a captain row in case
  // a legacy captain has no team_members entry. Scoring is open to any member.
  const playTeamIds = new Set<string>([
    ...(captainTeams ?? []).map((t) => t.id as string),
    ...memberTeamIds,
  ]);

  const ors: string[] = [];
  const playList = [...playTeamIds].join(",");
  const memList = [...memberTeamIds].join(",");
  if (playTeamIds.size) {
    ors.push(`home_team_id.in.(${playList})`, `away_team_id.in.(${playList})`);
  }
  if (memberTeamIds.size) ors.push(`ref_team_id.in.(${memList})`);
  if (ors.length === 0) return [];

  const { data: matches } = await supabase
    .from("matches")
    .select(
      "id, competition_id, round, court, scheduled_at, status, home_team_id, away_team_id, ref_team_id, pool_id, bracket_position, match_format",
    )
    .or(ors.join(","));
  if (!matches || matches.length === 0) return [];

  const compIds = [...new Set(matches.map((m) => m.competition_id))];
  const teamIds = [
    ...new Set(
      matches.flatMap((m) =>
        [m.home_team_id, m.away_team_id, m.ref_team_id].filter(Boolean),
      ),
    ),
  ] as string[];
  const matchIds = matches.map((m) => m.id);
  const poolIds = [
    ...new Set(matches.map((m) => m.pool_id).filter(Boolean) as string[]),
  ];

  const [
    { data: comps },
    { data: teams },
    { data: sets },
    { data: confs },
    { data: pools },
    { data: tsettings },
  ] = await Promise.all([
    supabase
      .from("competitions")
      .select(
        "id, name, type, slug, timezone, match_format, allow_captain_entry, allow_ref_entry, require_confirmation, status",
      )
      .in("id", compIds),
    supabase.from("teams").select("id, name").in("id", teamIds),
    supabase
      .from("sets")
      .select("match_id, set_number, home_score, away_score")
      .in("match_id", matchIds)
      .order("set_number", { ascending: true }),
    supabase
      .from("match_confirmations")
      .select("match_id, action, captain_user_id, created_at")
      .in("match_id", matchIds)
      .order("created_at", { ascending: true }),
    poolIds.length
      ? supabase.from("pools").select("id, match_format").in("id", poolIds)
      : Promise.resolve({
          data: [] as { id: string; match_format: MatchFormat | null }[],
        }),
    supabase
      .from("tournament_settings")
      .select("competition_id, pool_format")
      .in("competition_id", compIds),
  ]);

  const compById = new Map((comps ?? []).map((c) => [c.id as string, c]));
  // A competition the organizer marked completed (or cancelled) drops off My
  // Matches entirely — even games that were never scored.
  const liveMatches = matches.filter((m) => {
    const s = compById.get(m.competition_id)?.status;
    return s !== "completed" && s !== "cancelled";
  });
  const poolFormatById = new Map(
    (pools ?? []).map((p) => [
      p.id as string,
      (p.match_format as MatchFormat | null) ?? null,
    ]),
  );
  // The tournament's chosen pool-play format, applied to pool matches that have
  // no explicit per-pool override.
  const poolDefaultByComp = new Map(
    (tsettings ?? []).map((s) => [
      s.competition_id as string,
      (s.pool_format as MatchFormat | null) ?? null,
    ]),
  );
  const teamName = new Map(
    (teams ?? []).map((t) => [t.id as string, t.name as string]),
  );
  const setsByMatch = new Map<string, { home: number; away: number }[]>();
  for (const s of sets ?? []) {
    const list = setsByMatch.get(s.match_id) ?? [];
    list.push({ home: s.home_score, away: s.away_score });
    setsByMatch.set(s.match_id, list);
  }
  // Latest submitter + latest action per match.
  const latestAction = new Map<string, string>();
  const latestSubmitter = new Map<string, string>();
  for (const c of confs ?? []) {
    latestAction.set(c.match_id, c.action);
    if (c.action === "submitted")
      latestSubmitter.set(c.match_id, c.captain_user_id);
  }

  const result: MyMatch[] = liveMatches.map((m) => {
    const c = compById.get(m.competition_id)!;
    const isPlaying =
      (m.home_team_id && playTeamIds.has(m.home_team_id)) ||
      (m.away_team_id && playTeamIds.has(m.away_team_id));
    const isRefMember = !!m.ref_team_id && memberTeamIds.has(m.ref_team_id);

    const eligible =
      (c.allow_captain_entry && !!isPlaying) ||
      (c.allow_ref_entry && isRefMember);
    // A future-dated game can't be scored until game day.
    const future = isFutureMatch(m.scheduled_at, c.timezone);
    const canEnter = eligible && !future;
    const lockedFuture = eligible && future;

    let state: ConfirmationState = "none";
    if (m.status === "completed") state = "final";
    else if (latestAction.get(m.id) === "disputed") state = "disputed";
    else if (latestAction.get(m.id) === "submitted") state = "pending";

    const iAmSubmitter = latestSubmitter.get(m.id) === user.id;
    const canConfirm =
      c.require_confirmation &&
      state === "pending" &&
      !iAmSubmitter &&
      canEnter;

    return {
      id: m.id,
      competitionId: m.competition_id,
      competitionName: c.name,
      competitionType: c.type,
      slug: c.slug,
      timezone: c.timezone,
      round: m.round,
      court: m.court,
      scheduledAt: m.scheduled_at,
      homeTeamId: m.home_team_id,
      awayTeamId: m.away_team_id,
      refTeamId: m.ref_team_id,
      homeTeamName: m.home_team_id
        ? (teamName.get(m.home_team_id) ?? "TBD")
        : "TBD",
      awayTeamName: m.away_team_id
        ? (teamName.get(m.away_team_id) ?? "TBD")
        : "TBD",
      refTeamName: m.ref_team_id ? (teamName.get(m.ref_team_id) ?? null) : null,
      matchFormat:
        (m.match_format as MatchFormat | null) ??
        resolveMatchFormat(
          m.pool_id ? poolFormatById.get(m.pool_id) : null,
          m.pool_id ? poolDefaultByComp.get(m.competition_id) : null,
          c.match_format as MatchFormat,
        ),
      sets: setsByMatch.get(m.id) ?? [],
      status: m.status,
      state,
      role: isPlaying ? "play" : "ref",
      phase: m.bracket_position != null ? "bracket" : "pool",
      canEnter,
      canConfirm,
      lockedFuture,
    };
  });

  const rank = (m: MyMatch) =>
    (m.state === "final" ? 1_000_000 : 0) +
    (m.round ?? 999) * 1000 +
    parseInt((m.court ?? "").replace(/\D/g, "") || "999", 10);
  result.sort((a, b) => rank(a) - rank(b));
  return result;
}

export interface MatchEntryData {
  id: string;
  competitionId: string;
  competitionName: string;
  /** "tournament" | "league" — drives the organizer's admin back-link. */
  competitionType: string;
  orgId: string;
  timezone: string;
  homeTeamName: string;
  awayTeamName: string;
  refTeamName: string | null;
  matchFormat: MatchFormat;
  sets: { home: number; away: number }[];
  status: string;
  state: ConfirmationState;
  requireConfirmation: boolean;
  canEnter: boolean;
  canConfirm: boolean;
  /** The viewer administers this competition — may enter/edit any match. */
  isAdmin: boolean;
  /** Recorded via the organizer override (abandoned/injury). */
  isAbnormal: boolean;
  /** Future-dated game a non-admin can't score yet — locked until game day. */
  futureLocked: boolean;
  /** Non-null for playoff matches; drives whether a result can be cleared. */
  bracketPosition: number | null;
}

/** Single match for the score-entry page (null if not found / not viewable). */
export async function getMatchForEntry(
  matchId: string,
): Promise<MatchEntryData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: m } = await supabase
    .from("matches")
    .select(
      "id, competition_id, status, scheduled_at, home_team_id, away_team_id, ref_team_id, pool_id, bracket_position, is_abnormal, match_format",
    )
    .eq("id", matchId)
    .single();
  if (!m) return null;

  const [
    { data: comp },
    { data: canEnterData },
    { data: isAdminData },
    { data: teams },
    { data: sets },
    { data: confs },
  ] = await Promise.all([
    supabase
      .from("competitions")
      .select(
        "name, type, org_id, timezone, match_format, require_confirmation",
      )
      .eq("id", m.competition_id)
      .single(),
    supabase.rpc("can_enter_score", { _match_id: matchId }),
    supabase.rpc("is_competition_admin", { _competition_id: m.competition_id }),
    supabase
      .from("teams")
      .select("id, name")
      .in(
        "id",
        [m.home_team_id, m.away_team_id, m.ref_team_id].filter(
          Boolean,
        ) as string[],
      ),
    supabase
      .from("sets")
      .select("set_number, home_score, away_score")
      .eq("match_id", matchId)
      .order("set_number", { ascending: true }),
    supabase
      .from("match_confirmations")
      .select("action, captain_user_id, created_at")
      .eq("match_id", matchId)
      .order("created_at", { ascending: true }),
  ]);
  if (!comp) return null;

  let poolFormat: MatchFormat | null = null;
  let poolDefault: MatchFormat | null = null;
  if (m.pool_id) {
    const { data: pool } = await supabase
      .from("pools")
      .select("match_format")
      .eq("id", m.pool_id)
      .single();
    poolFormat = (pool?.match_format as MatchFormat | null) ?? null;
    const { data: ts } = await supabase
      .from("tournament_settings")
      .select("pool_format")
      .eq("competition_id", m.competition_id)
      .single();
    poolDefault = (ts?.pool_format as MatchFormat | null) ?? null;
  }

  const teamName = new Map(
    (teams ?? []).map((t) => [t.id as string, t.name as string]),
  );
  let state: ConfirmationState = "none";
  if (m.status === "completed") state = "final";
  else if ((confs ?? []).at(-1)?.action === "disputed") state = "disputed";
  else if ((confs ?? []).some((c) => c.action === "submitted"))
    state = "pending";

  const lastSubmitter = [...(confs ?? [])]
    .reverse()
    .find((c) => c.action === "submitted")?.captain_user_id;
  const isAdmin = isAdminData === true;
  // A future-dated game is locked for non-admins until game day.
  const futureLocked = !isAdmin && isFutureMatch(m.scheduled_at, comp.timezone);
  const canEnter = canEnterData === true && !futureLocked;
  // An organizer's entry is authoritative — no confirmation step, and they can
  // edit a final score. Captains still go through require_confirmation.
  const requireConfirmation = comp.require_confirmation === true && !isAdmin;
  const canConfirm =
    requireConfirmation &&
    state === "pending" &&
    lastSubmitter !== user.id &&
    canEnter;

  return {
    id: m.id,
    competitionId: m.competition_id,
    competitionName: comp.name,
    competitionType: comp.type,
    orgId: comp.org_id,
    timezone: comp.timezone,
    homeTeamName: m.home_team_id
      ? (teamName.get(m.home_team_id) ?? "TBD")
      : "TBD",
    awayTeamName: m.away_team_id
      ? (teamName.get(m.away_team_id) ?? "TBD")
      : "TBD",
    refTeamName: m.ref_team_id ? (teamName.get(m.ref_team_id) ?? null) : null,
    matchFormat:
      (m.match_format as MatchFormat | null) ??
      resolveMatchFormat(
        poolFormat,
        poolDefault,
        comp.match_format as MatchFormat,
      ),
    sets: (sets ?? []).map((s) => ({ home: s.home_score, away: s.away_score })),
    status: m.status,
    state,
    requireConfirmation,
    canEnter,
    canConfirm,
    isAdmin,
    isAbnormal: m.is_abnormal === true,
    futureLocked,
    bracketPosition: m.bracket_position,
  };
}

// --- playoff projections (my-matches "Potential Playoff" cards) -------------

export interface PlayoffProjection {
  competitionId: string;
  competitionName: string;
  teamId: string;
  teamName: string;
  /** Null for a single-elim bracket. */
  track: "championship" | "consolation" | null;
  seed: number;
  /** Round-1 opponent; null = a bye (or, when madeBracket is false, no matchup). */
  opponentName: string | null;
  /** Rough estimate (ISO) of the team's first playoff game; null = no basis. */
  firstGameAt: string | null;
  /** Venue timezone, for formatting firstGameAt. */
  timezone: string;
  /** False when the team currently sits outside the advancement cutoff. */
  madeBracket: boolean;
  poolsComplete: boolean;
  tiedAtCutoff: boolean;
}

/**
 * For each of the viewer's teams in a tournament where pools are drawn but no
 * bracket exists yet, project where they'd land if pools ended now — reusing
 * getBracketPreview (the shared engine). Empty once the bracket is generated
 * (the real matches then show via getMyMatches).
 */
export async function getMyPlayoffProjections(): Promise<PlayoffProjection[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [{ data: captainTeams }, { data: memberTeams }] = await Promise.all([
    supabase.from("teams").select("id").eq("captain_user_id", user.id),
    supabase.from("team_members").select("team_id").eq("user_id", user.id),
  ]);
  const myTeamIds = new Set<string>([
    ...(captainTeams ?? []).map((t) => t.id as string),
    ...(memberTeams ?? []).map((m) => m.team_id as string),
  ]);
  if (myTeamIds.size === 0) return [];

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, competition_id")
    .in("id", [...myTeamIds]);
  if (!teams || teams.length === 0) return [];

  const compIds = [...new Set(teams.map((t) => t.competition_id))];
  const { data: comps } = await supabase
    .from("competitions")
    .select("id, name, timezone")
    .in("id", compIds)
    .eq("type", "tournament");
  const compInfo = new Map(
    (comps ?? []).map((c) => [
      c.id as string,
      { name: c.name as string, timezone: c.timezone as string },
    ]),
  );
  if (compInfo.size === 0) return [];

  const out: PlayoffProjection[] = [];
  for (const compId of compInfo.keys()) {
    // Skip competitions whose bracket is already generated (real matches show
    // via getMyMatches), and those without pools drawn (nothing to project yet).
    const [{ data: bracket }, { data: pools }] = await Promise.all([
      supabase
        .from("matches")
        .select("id")
        .eq("competition_id", compId)
        .not("bracket_position", "is", null)
        .limit(1),
      supabase.from("pools").select("id").eq("competition_id", compId).limit(1),
    ]);
    if (bracket && bracket.length) continue;
    if (!pools || pools.length === 0) continue;

    const preview = await getBracketPreview(compId);
    if (!preview) continue;

    const info = compInfo.get(compId)!;
    const byTeam = new Map(preview.teams.map((t) => [t.teamId, t]));
    for (const t of teams.filter((x) => x.competition_id === compId)) {
      const p = byTeam.get(t.id);
      out.push({
        competitionId: compId,
        competitionName: info.name,
        timezone: info.timezone,
        teamId: t.id,
        teamName: t.name,
        track: p?.track ?? null,
        seed: p?.seed ?? 0,
        opponentName: p?.opponentName ?? null,
        firstGameAt: p?.firstGameAt ?? null,
        madeBracket: !!p,
        poolsComplete: preview.poolsComplete,
        tiedAtCutoff: preview.tiedAtCutoff,
      });
    }
  }
  return out;
}
