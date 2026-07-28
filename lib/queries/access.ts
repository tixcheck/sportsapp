import { createClient } from "@/lib/supabase/server";
import { isFutureMatch } from "@/lib/scoring/lock";

/** Statuses that mean a game is settled — no fresh score entry. */
const FINAL_STATUS = new Set(["completed", "forfeit", "cancelled"]);

export type OrganizerStatus = "none" | "pending" | "approved";

export interface AccessState {
  organizerStatus: OrganizerStatus;
  isPlatformAdmin: boolean;
}

/** The signed-in user's platform-level access (organizer status + admin flag). */
export async function getAccessState(): Promise<AccessState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { organizerStatus: "none", isPlatformAdmin: false };

  const { data } = await supabase
    .from("users")
    .select("organizer_status, is_platform_admin")
    .eq("id", user.id)
    .single();
  return {
    organizerStatus: (data?.organizer_status as OrganizerStatus) ?? "none",
    isPlatformAdmin: data?.is_platform_admin === true,
  };
}

export interface OrganizerRequestRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  note: string | null;
  requestedAt: string;
}

/**
 * Pending organizer requests (RLS: only the platform admin sees others' rows).
 * Joined to the requester's name/email for the admin list.
 */
export async function getPendingOrganizerRequests(): Promise<
  OrganizerRequestRow[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizer_requests")
    .select(
      "id, user_id, note, requested_at, users:user_id(display_name, email)",
    )
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  return (data ?? []).map((r) => {
    const u = r.users as
      | { display_name: string | null; email: string }
      | { display_name: string | null; email: string }[]
      | null;
    const user = Array.isArray(u) ? u[0] : u;
    return {
      id: r.id as string,
      userId: r.user_id as string,
      userName: user?.display_name ?? "—",
      userEmail: user?.email ?? "—",
      note: (r.note as string | null) ?? null,
      requestedAt: r.requested_at as string,
    };
  });
}

/**
 * The signed-in user's team id(s) in a competition (for the "My team" badge).
 * Empty for anonymous viewers and non-members.
 */
export async function getMyTeamIds(competitionId: string): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("competition_id", competitionId);
  const teamIds = (teams ?? []).map((t) => t.id);
  if (teamIds.length === 0) return [];

  const { data: mems } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id)
    .in("team_id", teamIds);
  return [...new Set((mems ?? []).map((m) => m.team_id as string))];
}

/**
 * Match ids in a competition the signed-in user may enter a score for *right now*
 * — so the public schedule can offer "Enter score" on their own games, not just
 * the My Matches page. Mirrors the My Matches gate: a playing member when the
 * league allows captain entry, or a ref-team member when it allows ref entry;
 * future-dated and already-settled games are excluded. Empty for anonymous
 * viewers, non-participants, and leagues where neither entry mode is on.
 */
export async function getScorableMatchIds(
  competitionId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: comp } = await supabase
    .from("competitions")
    .select("allow_captain_entry, allow_ref_entry, timezone")
    .eq("id", competitionId)
    .single();
  if (!comp || (!comp.allow_captain_entry && !comp.allow_ref_entry)) return [];

  const [{ data: captainTeams }, { data: memberTeams }] = await Promise.all([
    supabase
      .from("teams")
      .select("id")
      .eq("competition_id", competitionId)
      .eq("captain_user_id", user.id),
    supabase.from("team_members").select("team_id").eq("user_id", user.id),
  ]);
  const memberTeamIds = new Set(
    (memberTeams ?? []).map((m) => m.team_id as string),
  );
  // Any roster membership counts as "playing" (matches My Matches); include a
  // captain row in case a legacy captain has no team_members entry.
  const playTeamIds = new Set<string>([
    ...(captainTeams ?? []).map((t) => t.id as string),
    ...memberTeamIds,
  ]);
  if (playTeamIds.size === 0) return [];

  const { data: matches } = await supabase
    .from("matches")
    .select("id, scheduled_at, status, home_team_id, away_team_id, ref_team_id")
    .eq("competition_id", competitionId);

  const tz = comp.timezone ?? "America/Toronto";
  const out: string[] = [];
  for (const m of matches ?? []) {
    if (FINAL_STATUS.has(m.status as string)) continue;
    const isPlaying =
      (m.home_team_id && playTeamIds.has(m.home_team_id as string)) ||
      (m.away_team_id && playTeamIds.has(m.away_team_id as string));
    const isRefMember =
      !!m.ref_team_id && memberTeamIds.has(m.ref_team_id as string);
    const eligible =
      (comp.allow_captain_entry && isPlaying) ||
      (comp.allow_ref_entry && isRefMember);
    if (eligible && !isFutureMatch(m.scheduled_at as string | null, tz)) {
      out.push(m.id as string);
    }
  }
  return out;
}

/** Count of pending requests visible to the caller (platform admin → all). */
export async function getPendingOrganizerRequestCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("organizer_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}
