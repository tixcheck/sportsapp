import { createClient } from "@/lib/supabase/server";
import type { MatchAuditAction, MatchAuditDetail } from "@/lib/db/schema";

/**
 * Writing the match audit trail.
 *
 * Best-effort by design: a score that was entered correctly must not be
 * rejected because its history row failed to write. But "best effort" is not
 * "silent" — a failure is logged so a trail that has quietly stopped recording
 * shows up in the logs rather than being discovered years later, empty, during
 * an incident. That is exactly how this table spent its first year.
 *
 * Nothing here is PII: team names are competition-scoped labels, and the actor
 * is a user id, never a name or an email (CLAUDE.md — never log PII).
 */

// Same alias the bracket and standings modules use.
type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

export type AuditInput = {
  competitionId: string;
  /** Null for competition-wide events like erasing a schedule. */
  matchId?: string | null;
  actorUserId?: string | null;
  action: MatchAuditAction;
  /** One human sentence: what changed, in the words an organizer would use. */
  summary: string;
  detail?: MatchAuditDetail;
};

export async function recordMatchAudit(
  supabase: SupabaseServer,
  input: AuditInput,
): Promise<void> {
  const { error } = await supabase.from("match_audit").insert({
    competition_id: input.competitionId,
    match_id: input.matchId ?? null,
    changed_by_user_id: input.actorUserId ?? null,
    action: input.action,
    change_summary: input.summary,
    detail: input.detail ?? null,
  });

  if (error) {
    console.error("[audit] failed to record", input.action, error.message);
  }
}

/** Several rows at once — used when one action touches many matches. */
export async function recordMatchAuditBatch(
  supabase: SupabaseServer,
  rows: AuditInput[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("match_audit").insert(
    rows.map((r) => ({
      competition_id: r.competitionId,
      match_id: r.matchId ?? null,
      changed_by_user_id: r.actorUserId ?? null,
      action: r.action,
      change_summary: r.summary,
      detail: r.detail ?? null,
    })),
  );
  if (error) {
    console.error("[audit] failed to record batch", error.message);
  }
}

/** "25–19, 25–23" — how a set list reads in the app and in an email. */
export function formatSets(sets: [number, number][] | undefined): string {
  if (!sets?.length) return "no sets";
  return sets.map(([h, a]) => `${h}–${a}`).join(", ");
}
