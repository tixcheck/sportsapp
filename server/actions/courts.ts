"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  respreadCourts,
  numberedCourts,
  type RespreadMatch,
} from "@/lib/scheduler/court-respread";
import type { LeagueCourt, WeeklySlot } from "@/lib/db/schema";

/** Statuses that mean a game has been played — its court is left alone. */
const SETTLED = new Set(["in_progress", "completed", "forfeit"]);

export type ApplyCourtsArgs = { competitionId: string; courts: number };

export type ApplyCourtsPreview = {
  currentCourts: number;
  targetCourts: number;
  /** Custom named courts, if the league uses them (then `courts` is ignored). */
  usesCustomCourts: boolean;
  reassigned: number;
  playedUntouched: number;
  waves: number;
  maxGamesPerWave: number;
  /** Waves that STILL have more games than courts after applying. */
  overCapacityWaves: number;
};

type Loaded = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  slots: WeeklySlot[];
  courtLabels: string[];
  usesCustomCourts: boolean;
  currentCourts: number;
  targetCourts: number;
  unplayed: RespreadMatch[];
  playedCount: number;
};

async function load(
  args: ApplyCourtsArgs,
): Promise<{ error: string } | Loaded> {
  if (!Number.isInteger(args.courts) || args.courts < 1 || args.courts > 20) {
    return { error: "Enter a court count between 1 and 20." };
  }

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: args.competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can change courts." };
  }

  const [{ data: settings }, { data: rows }] = await Promise.all([
    supabase
      .from("league_settings")
      .select("weekly_slots, court_list")
      .eq("competition_id", args.competitionId)
      .single(),
    supabase
      .from("matches")
      .select("id, scheduled_at, status")
      .eq("competition_id", args.competitionId),
  ]);
  if (!settings) return { error: "League settings not found." };

  const slots = (settings.weekly_slots as WeeklySlot[] | null) ?? [];
  const courtList = (settings.court_list as LeagueCourt[] | null) ?? [];
  const usesCustomCourts = courtList.length > 0;

  const currentCourts = usesCustomCourts
    ? courtList.length
    : (slots[0]?.courts ?? 1);
  const targetCourts = usesCustomCourts ? courtList.length : args.courts;
  const courtLabels = usesCustomCourts
    ? courtList.map((c) => c.label)
    : numberedCourts(targetCourts);

  const matches = rows ?? [];
  const unplayed = matches
    .filter((m) => !SETTLED.has(m.status as string))
    .map((m) => ({
      id: m.id as string,
      scheduledAt: m.scheduled_at as string | null,
    }));

  return {
    supabase,
    slots,
    courtLabels,
    usesCustomCourts,
    currentCourts,
    targetCourts,
    unplayed,
    playedCount: matches.length - unplayed.length,
  };
}

export async function previewApplyCourtsAction(
  args: ApplyCourtsArgs,
): Promise<{ error: string } | ApplyCourtsPreview> {
  const ctx = await load(args);
  if ("error" in ctx) return ctx;

  const res = respreadCourts(ctx.unplayed, ctx.courtLabels);

  return {
    currentCourts: ctx.currentCourts,
    targetCourts: ctx.targetCourts,
    usesCustomCourts: ctx.usesCustomCourts,
    reassigned: res.assignments.length,
    playedUntouched: ctx.playedCount,
    waves: res.waves,
    maxGamesPerWave: res.maxGamesPerWave,
    overCapacityWaves: res.overCapacityWaves,
  };
}

export async function applyCourtsToUpcomingAction(
  args: ApplyCourtsArgs,
): Promise<{ error: string } | { reassigned: number }> {
  const ctx = await load(args);
  if ("error" in ctx) return ctx;

  const { supabase } = ctx;
  const res = respreadCourts(ctx.unplayed, ctx.courtLabels);
  if (res.assignments.length === 0) {
    return { error: "No upcoming games to reassign." };
  }

  // One update per court label (each covers all games moving to that court).
  const idsByCourt = new Map<string, string[]>();
  for (const a of res.assignments) {
    const list = idsByCourt.get(a.court) ?? [];
    list.push(a.id);
    idsByCourt.set(a.court, list);
  }
  for (const [court, ids] of idsByCourt) {
    const { error } = await supabase
      .from("matches")
      .update({ court })
      .in("id", ids);
    if (error) return { error: error.message };
  }

  // Persist the new court count so future regenerations use it too. Custom-court
  // leagues carry their count in court_list, which the organizer edits directly.
  if (!ctx.usesCustomCourts && ctx.slots.length > 0) {
    const nextSlots = ctx.slots.map((s, i) =>
      i === 0 ? { ...s, courts: ctx.targetCourts } : s,
    );
    await supabase
      .from("league_settings")
      .update({ weekly_slots: nextSlots })
      .eq("competition_id", args.competitionId);
  }

  revalidatePath("/orgs");
  revalidatePath("/my-matches");
  return { reassigned: res.assignments.length };
}
