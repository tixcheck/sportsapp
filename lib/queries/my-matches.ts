import { createClient } from "@/lib/supabase/server";
import { resolveMatchFormat } from "@/lib/scheduler/pools";
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
  homeTeamName: string;
  awayTeamName: string;
  refTeamName: string | null;
  matchFormat: MatchFormat;
  sets: { home: number; away: number }[];
  status: string;
  state: ConfirmationState;
  role: "play" | "ref";
  canEnter: boolean;
  canConfirm: boolean;
}

/**
 * Matches the current user can act on — as a captain of a playing team, or as a
 * member of a match's reffing team. Sorted "what's next" by round → court
 * (scheduled times are estimates), completed last.
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
  const captainTeamIds = new Set(
    (captainTeams ?? []).map((t) => t.id as string),
  );

  const { data: memberTeams } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id);
  const memberTeamIds = new Set(
    (memberTeams ?? []).map((m) => m.team_id as string),
  );

  const ors: string[] = [];
  const capList = [...captainTeamIds].join(",");
  const memList = [...memberTeamIds].join(",");
  if (captainTeamIds.size) {
    ors.push(`home_team_id.in.(${capList})`, `away_team_id.in.(${capList})`);
  }
  if (memberTeamIds.size) ors.push(`ref_team_id.in.(${memList})`);
  if (ors.length === 0) return [];

  const { data: matches } = await supabase
    .from("matches")
    .select(
      "id, competition_id, round, court, scheduled_at, status, home_team_id, away_team_id, ref_team_id, pool_id",
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
  ] = await Promise.all([
    supabase
      .from("competitions")
      .select(
        "id, name, type, slug, timezone, match_format, allow_captain_entry, allow_ref_entry, require_confirmation",
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
  ]);

  const compById = new Map((comps ?? []).map((c) => [c.id as string, c]));
  const poolFormatById = new Map(
    (pools ?? []).map((p) => [
      p.id as string,
      (p.match_format as MatchFormat | null) ?? null,
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

  const result: MyMatch[] = matches.map((m) => {
    const c = compById.get(m.competition_id)!;
    const isCaptainPlaying =
      (m.home_team_id && captainTeamIds.has(m.home_team_id)) ||
      (m.away_team_id && captainTeamIds.has(m.away_team_id));
    const isRefMember = !!m.ref_team_id && memberTeamIds.has(m.ref_team_id);

    const canEnter =
      (c.allow_captain_entry && !!isCaptainPlaying) ||
      (c.allow_ref_entry && isRefMember);

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
      homeTeamName: m.home_team_id
        ? (teamName.get(m.home_team_id) ?? "TBD")
        : "TBD",
      awayTeamName: m.away_team_id
        ? (teamName.get(m.away_team_id) ?? "TBD")
        : "TBD",
      refTeamName: m.ref_team_id ? (teamName.get(m.ref_team_id) ?? null) : null,
      matchFormat: resolveMatchFormat(
        m.pool_id ? poolFormatById.get(m.pool_id) : null,
        c.match_format as MatchFormat,
      ),
      sets: setsByMatch.get(m.id) ?? [],
      status: m.status,
      state,
      role: isCaptainPlaying ? "play" : "ref",
      canEnter,
      canConfirm,
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
  competitionName: string;
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
      "id, competition_id, status, home_team_id, away_team_id, ref_team_id, pool_id, is_abnormal",
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
      .select("name, timezone, match_format, require_confirmation")
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
  if (m.pool_id) {
    const { data: pool } = await supabase
      .from("pools")
      .select("match_format")
      .eq("id", m.pool_id)
      .single();
    poolFormat = (pool?.match_format as MatchFormat | null) ?? null;
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
  const canEnter = canEnterData === true;
  const isAdmin = isAdminData === true;
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
    competitionName: comp.name,
    timezone: comp.timezone,
    homeTeamName: m.home_team_id
      ? (teamName.get(m.home_team_id) ?? "TBD")
      : "TBD",
    awayTeamName: m.away_team_id
      ? (teamName.get(m.away_team_id) ?? "TBD")
      : "TBD",
    refTeamName: m.ref_team_id ? (teamName.get(m.ref_team_id) ?? null) : null,
    matchFormat: resolveMatchFormat(
      poolFormat,
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
  };
}
