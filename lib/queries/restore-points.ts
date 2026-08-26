import { createClient } from "@/lib/supabase/server";

/**
 * Reading restore points. RLS scopes these to org admins, so a captain calling
 * this gets an empty list rather than a permission error.
 */

export interface RestorePointRow {
  id: string;
  scope: "competition" | "match";
  reason: string;
  label: string;
  matchCount: number;
  resultCount: number;
  createdAt: string;
  expiresAt: string | null;
  competitionName: string;
  /** The league is gone; this snapshot is all that is left of it. */
  orphaned: boolean;
}

type Record_ = {
  id: string;
  scope: string;
  reason: string;
  label: string;
  match_count: number;
  result_count: number;
  created_at: string;
  expires_at: string | null;
  competition_id: string | null;
  competition_name: string;
};

const COLUMNS =
  "id, scope, reason, label, match_count, result_count, created_at, expires_at, competition_id, competition_name";

function toRow(r: Record_): RestorePointRow {
  return {
    id: r.id,
    scope: r.scope as RestorePointRow["scope"],
    reason: r.reason,
    label: r.label,
    matchCount: r.match_count,
    resultCount: r.result_count,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    competitionName: r.competition_name,
    orphaned: r.competition_id === null,
  };
}

/** Restore points for one competition, newest first. */
export async function getRestorePoints(
  competitionId: string,
  limit = 25,
): Promise<RestorePointRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("restore_points")
    .select(COLUMNS)
    .eq("competition_id", competitionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as Record_[]).map(toRow);
}

/**
 * Snapshots whose league has been deleted — the "recently deleted" shelf.
 *
 * These are the ones with an expiry running, so the org page can show what is
 * still recoverable and for how long.
 */
export async function getOrphanedRestorePoints(
  orgId: string,
): Promise<RestorePointRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("restore_points")
    .select(COLUMNS)
    .eq("org_id", orgId)
    .is("competition_id", null)
    .order("created_at", { ascending: false })
    .limit(25);
  return ((data ?? []) as unknown as Record_[]).map(toRow);
}
