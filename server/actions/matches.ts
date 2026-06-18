"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { detectConflicts, type SlotMatch } from "@/lib/scheduler/conflicts";
import { notifyScheduleChanged } from "@/lib/notifications/notify";

export type Conflict = {
  type: "court" | "team";
  matchId: string;
  detail: string;
};

export type RescheduleResult =
  | { error: string }
  | { conflicts: Conflict[] }
  | { success: true };

/**
 * Reschedule a match's time and/or court. A "slot" is the exact scheduled
 * instant; conflicts are (a) the same court booked twice in a slot, or (b) a
 * team playing twice in a slot. With `override`, conflicts are saved anyway.
 */
export async function rescheduleMatchAction(
  matchId: string,
  scheduledAt: string,
  court: string,
  override: boolean,
): Promise<RescheduleResult> {
  const supabase = await createClient();

  const { data: match, error } = await supabase
    .from("matches")
    .select("competition_id, home_team_id, away_team_id")
    .eq("id", matchId)
    .single();
  if (error || !match) return { error: "Match not found." };

  const { data: others } = await supabase
    .from("matches")
    .select(
      "id, court, scheduled_at, home_team_id, away_team_id, home:home_team_id(name), away:away_team_id(name)",
    )
    .eq("competition_id", match.competition_id)
    .neq("id", matchId);

  const slotMatches: SlotMatch[] = (others ?? []).map((o) => ({
    id: o.id,
    scheduledAt: o.scheduled_at,
    court: o.court,
    homeTeamId: o.home_team_id,
    awayTeamId: o.away_team_id,
  }));
  const labelById = new Map(
    (others ?? []).map((o) => [
      o.id as string,
      `${pickName(o.home)} vs ${pickName(o.away)}`,
    ]),
  );

  const raw = detectConflicts(
    {
      id: matchId,
      homeTeamId: match.home_team_id,
      awayTeamId: match.away_team_id,
    },
    scheduledAt,
    court,
    slotMatches,
  );
  const conflicts: Conflict[] = raw.map((c) => ({
    type: c.type,
    matchId: c.matchId,
    detail:
      c.type === "court"
        ? `${court} is already hosting ${labelById.get(c.matchId)}.`
        : `A team is already playing ${labelById.get(c.matchId)} at this time.`,
  }));

  if (conflicts.length > 0 && !override) {
    return { conflicts };
  }

  const { error: updErr } = await supabase
    .from("matches")
    .update({ scheduled_at: scheduledAt, court })
    .eq("id", matchId);
  if (updErr) return { error: updErr.message };

  // Best-effort alert to both teams (opt-out: notify_schedule_changes).
  await notifyScheduleChanged(supabase, matchId, scheduledAt, court);

  revalidatePath("/orgs");
  return { success: true };
}

// Supabase may return an embedded relation as an object or a single-element
// array depending on the relationship; normalize to a name string.
function pickName(rel: unknown): string {
  if (Array.isArray(rel)) return (rel[0] as { name?: string })?.name ?? "TBD";
  return (rel as { name?: string } | null)?.name ?? "TBD";
}
