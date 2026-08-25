import { createClient } from "@/lib/supabase/server";
import type { MatchAuditAction, MatchAuditDetail } from "@/lib/db/schema";

/**
 * Reading the match audit trail.
 *
 * RLS decides visibility: organizers see their whole competition, captains see
 * their own matches. Nothing here re-checks that, because re-checking in two
 * places is how the two drift apart.
 *
 * Rows whose `matchId` is null are the ones that matter most — a match was
 * deleted and this is all that is left of it — so they are never filtered out.
 */

export interface AuditEntry {
  id: string;
  matchId: string | null;
  action: MatchAuditAction;
  summary: string;
  detail: MatchAuditDetail | null;
  actorName: string | null;
  createdAt: string;
  /** The row describes a match that no longer exists. */
  orphaned: boolean;
}

type Record_ = {
  id: string;
  match_id: string | null;
  action: string;
  change_summary: string;
  detail: MatchAuditDetail | null;
  created_at: string;
  users:
    | { display_name: string | null }
    | { display_name: string | null }[]
    | null;
};

const COLUMNS =
  "id, match_id, action, change_summary, detail, created_at, users:changed_by_user_id(display_name)";

function toEntry(r: Record_): AuditEntry {
  const actor = Array.isArray(r.users) ? r.users[0] : r.users;
  return {
    id: r.id,
    matchId: r.match_id,
    action: r.action as MatchAuditAction,
    summary: r.change_summary,
    detail: r.detail,
    actorName: actor?.display_name ?? null,
    createdAt: r.created_at,
    orphaned: r.match_id === null,
  };
}

/** Newest-first history for a whole competition. */
export async function getCompetitionAudit(
  competitionId: string,
  limit = 50,
): Promise<AuditEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("match_audit")
    .select(COLUMNS)
    .eq("competition_id", competitionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as Record_[]).map(toEntry);
}

/** Newest-first history for a single match. */
export async function getMatchAudit(matchId: string): Promise<AuditEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("match_audit")
    .select(COLUMNS)
    .eq("match_id", matchId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as Record_[]).map(toEntry);
}
