"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { detectConflicts, type SlotMatch } from "@/lib/scheduler/conflicts";
import {
  notifyScheduleChanged,
  notifySchedulePushed,
} from "@/lib/notifications/notify";
import {
  planScheduleShift,
  type ShiftMatch,
  type ShiftPlan,
} from "@/lib/scheduler/shift-schedule";
import {
  shiftScheduleSchema,
  type ShiftScheduleInput,
} from "@/lib/validations/league";

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

// --- bulk schedule shift ("postpone a week") --------------------------------

export type ShiftPreview = {
  moving: number;
  alreadyPlayed: number;
  noTime: number;
  vacatedDates: string[];
  newEndDate: string | null;
  warnings: ShiftPlan["warnings"];
  /** First few moves, for a human-readable preview. */
  sample: { label: string; from: string; to: string }[];
};

type Loaded = {
  plan: ShiftPlan;
  matches: ShiftMatch[];
  labelById: Map<string, string>;
};

/**
 * Shared read + plan for both the preview and the apply. Authorization is
 * checked here so neither entry point can skip it.
 */
async function loadShiftPlan(
  input: ShiftScheduleInput,
): Promise<{ error: string } | Loaded> {
  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: input.competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can push the schedule." };
  }

  const { data: comp } = await supabase
    .from("competitions")
    .select("timezone, end_date")
    .eq("id", input.competitionId)
    .single();
  if (!comp) return { error: "League not found." };

  const [{ data: settings }, { data: rows }] = await Promise.all([
    supabase
      .from("league_settings")
      .select("blackout_dates")
      .eq("competition_id", input.competitionId)
      .maybeSingle(),
    supabase
      .from("matches")
      .select(
        "id, scheduled_at, court, status, home_team_id, away_team_id, home:home_team_id(name), away:away_team_id(name)",
      )
      .eq("competition_id", input.competitionId),
  ]);

  const matches: ShiftMatch[] = (rows ?? []).map((m) => ({
    id: m.id as string,
    scheduledAt: m.scheduled_at as string | null,
    court: m.court as string | null,
    homeTeamId: m.home_team_id as string | null,
    awayTeamId: m.away_team_id as string | null,
    status: m.status as string,
  }));
  const labelById = new Map(
    (rows ?? []).map((m) => [
      m.id as string,
      `${pickName(m.home)} vs ${pickName(m.away)}`,
    ]),
  );

  const plan = planScheduleShift({
    matches,
    fromDate: input.fromDate,
    weeks: input.weeks,
    timezone: comp.timezone ?? "America/Toronto",
    blackoutDates: (settings?.blackout_dates as string[] | null) ?? undefined,
    endDate: (comp.end_date as string | null) ?? null,
  });

  return { plan, matches, labelById };
}

/** Dry run: what a push would do, so the organizer can look before leaping. */
export async function previewScheduleShiftAction(
  input: ShiftScheduleInput,
): Promise<{ error: string } | ShiftPreview> {
  const parsed = shiftScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your input." };
  }

  const loaded = await loadShiftPlan(parsed.data);
  if ("error" in loaded) return loaded;
  const { plan, labelById } = loaded;

  return {
    moving: plan.moves.length,
    alreadyPlayed: plan.skipped.filter((s) => s.reason === "already-played")
      .length,
    noTime: plan.skipped.filter((s) => s.reason === "no-time").length,
    vacatedDates: plan.vacatedDates,
    newEndDate: plan.newEndDate,
    warnings: plan.warnings,
    sample: plan.moves.slice(0, 5).map((m) => ({
      label: labelById.get(m.matchId) ?? "Match",
      from: m.from,
      to: m.to,
    })),
  };
}

/**
 * Push every unplayed match on/after `fromDate` back by `weeks`, mark the
 * vacated days as blackout dates ("No Games"), extend the season end, and send
 * each affected player a single digest.
 *
 * Not transactional: Supabase's client can't wrap these in one statement, so a
 * mid-way failure leaves a partial shift. Batching by target time keeps the
 * number of writes to one per distinct slot to shrink that window.
 */
export async function shiftScheduleAction(
  input: ShiftScheduleInput,
): Promise<{ error: string } | { moved: number; vacatedDates: string[] }> {
  const parsed = shiftScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your input." };
  }

  const loaded = await loadShiftPlan(parsed.data);
  if ("error" in loaded) return loaded;
  const { plan, matches } = loaded;

  if (plan.moves.length === 0) {
    return { error: "No unplayed games on or after that date to push." };
  }

  const supabase = await createClient();

  // Matches sharing a start time share a new start time, so one write per slot.
  const idsByNewTime = new Map<string, string[]>();
  for (const mv of plan.moves) {
    const list = idsByNewTime.get(mv.to) ?? [];
    list.push(mv.matchId);
    idsByNewTime.set(mv.to, list);
  }

  let moved = 0;
  for (const [iso, ids] of idsByNewTime) {
    const { error } = await supabase
      .from("matches")
      .update({ scheduled_at: iso })
      .in("id", ids);
    if (error) return { error: error.message };
    moved += ids.length;
  }

  if (plan.vacatedDates.length > 0) {
    const { data: settings } = await supabase
      .from("league_settings")
      .select("blackout_dates")
      .eq("competition_id", parsed.data.competitionId)
      .maybeSingle();
    if (settings) {
      const merged = [
        ...new Set([
          ...((settings.blackout_dates as string[] | null) ?? []),
          ...plan.vacatedDates,
        ]),
      ].sort();
      await supabase
        .from("league_settings")
        .update({ blackout_dates: merged })
        .eq("competition_id", parsed.data.competitionId);
    }
  }

  if (plan.newEndDate) {
    await supabase
      .from("competitions")
      .update({ end_date: plan.newEndDate })
      .eq("id", parsed.data.competitionId);
  }

  await notifySchedulePushed(supabase, {
    competitionId: parsed.data.competitionId,
    teamIds: affectedTeamIds(plan, matches),
    weeks: parsed.data.weeks,
    reason: parsed.data.reason ?? null,
    nextGameByTeam: nextGamePerTeam(plan, matches),
  });

  revalidatePath("/orgs");
  revalidatePath("/my-matches");
  return { moved, vacatedDates: plan.vacatedDates };
}

function affectedTeamIds(plan: ShiftPlan, matches: ShiftMatch[]): string[] {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const ids = new Set<string>();
  for (const mv of plan.moves) {
    const m = byId.get(mv.matchId);
    if (m?.homeTeamId) ids.add(m.homeTeamId);
    if (m?.awayTeamId) ids.add(m.awayTeamId);
  }
  return [...ids];
}

/** Each team's earliest game after the shift — the "your next game" line. */
function nextGamePerTeam(
  plan: ShiftPlan,
  matches: ShiftMatch[],
): Map<string, string> {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const next = new Map<string, string>();
  for (const mv of plan.moves) {
    const m = byId.get(mv.matchId);
    if (!m) continue;
    for (const teamId of [m.homeTeamId, m.awayTeamId]) {
      if (!teamId) continue;
      const prev = next.get(teamId);
      if (!prev || mv.to < prev) next.set(teamId, mv.to);
    }
  }
  return next;
}
