"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";
import { planTierNight } from "@/lib/scheduler/ladder-night";
import { planLadderWeek, rankLadderNight } from "@/lib/scheduler/ladder-week";
import { applyLadderMovement } from "@/lib/scheduler/ladder-movement";
import { estimateMatchMinutes } from "@/lib/formats";
import {
  drawLadderWeekSchema,
  ladderSettingsSchema,
  lockLadderWeekSchema,
  type LadderSettingsInput,
} from "@/lib/validations/ladder";
import type { LeagueCourt, MatchFormat, WeeklySlot } from "@/lib/db/schema";
import type { MatchResult, RankMode } from "@/lib/scheduler/tiebreakers";

const DEFAULT_TIMEZONE = "America/Toronto";
const SETTLED = new Set(["completed", "forfeit", "cancelled"]);

type ActionError = { error: string };

/** First calendar date on/after `startIso` falling on weekday `dow` (0=Sun). */
function firstSlotDate(startIso: string, dow: number): string {
  const [y, m, d] = startIso.split("-").map(Number);
  let t = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 7; i++) {
    if (new Date(t).getUTCDay() === dow) break;
    t += 86_400_000;
  }
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Save the ladder configuration.
 *
 * `swaps` carries one count per boundary, so a league with N tiers needs N-1
 * entries; anything longer is trimmed and anything missing defaults to 0. There
 * is deliberately no separate up/down setting — see lib/scheduler/
 * ladder-movement.ts for why an unbalanced exchange isn't representable.
 */
export async function saveLadderSettingsAction(
  values: LadderSettingsInput,
): Promise<ActionError | { success: true }> {
  const parsed = ladderSettingsSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  }
  const v = parsed.data;

  const supabase = await createClient();

  const { data: divisions } = await supabase
    .from("divisions")
    .select("id")
    .eq("competition_id", v.competitionId);
  const tierCount = (divisions ?? []).length;

  if (v.enabled && tierCount < 2) {
    return {
      error: "A ladder needs at least two tiers. Add tiers first.",
    };
  }

  const boundaries = Math.max(0, tierCount - 1);
  const swaps = Array.from({ length: boundaries }, (_, i) => v.swaps[i] ?? 0);

  const { error } = await supabase
    .from("league_settings")
    .update({
      ladder_enabled: v.enabled,
      ladder_unit: v.unit,
      ladder_target: v.target,
      ladder_swaps: swaps,
    })
    .eq("competition_id", v.competitionId);
  if (error) return { error: error.message };

  revalidatePath("/orgs");
  return { success: true };
}

/** Read the shared bits both the draw and the lock need. */
async function loadLadderContext(competitionId: string) {
  const supabase = await createClient();

  const [{ data: comp }, { data: settings }, { data: divisions }] =
    await Promise.all([
      supabase
        .from("competitions")
        .select("start_date, timezone, match_format, slug")
        .eq("id", competitionId)
        .single(),
      supabase
        .from("league_settings")
        .select(
          "ladder_enabled, ladder_unit, ladder_target, ladder_swaps, weekly_slots, court_list, minutes_per_game, blackout_dates, tiebreaker",
        )
        .eq("competition_id", competitionId)
        .single(),
      supabase
        .from("divisions")
        .select(
          "id, name, tier_order, courts, ladder_target, minutes_per_set, start_time, late_start_slots",
        )
        .eq("competition_id", competitionId)
        .order("tier_order", { ascending: true }),
    ]);

  return { supabase, comp, settings, divisions: divisions ?? [] };
}

/**
 * Draw the next week's games.
 *
 * Week 1 seeds the ladder from each team's current tier (the one they
 * registered into). Later weeks read the placements the previous lock wrote —
 * which is why a ladder season can't be generated up front.
 */
export async function drawLadderWeekAction(
  competitionId: string,
): Promise<
  ActionError | { week: number; matchCount: number; shorted: number }
> {
  const parsed = drawLadderWeekSchema.safeParse({ competitionId });
  if (!parsed.success) return { error: "Unknown league." };

  const { supabase, comp, settings, divisions } =
    await loadLadderContext(competitionId);
  if (!comp || !settings) return { error: "League not found." };
  if (settings.ladder_enabled !== true) {
    return { error: "This league isn't set up as a ladder." };
  }
  if (!comp.start_date) return { error: "Set a season start date first." };
  if (divisions.length < 2)
    return { error: "A ladder needs at least two tiers." };

  const slot = (settings.weekly_slots as WeeklySlot[])[0];
  if (!slot) return { error: "No weekly slot configured." };

  const { data: teams } = await supabase
    .from("teams")
    .select("id, division_id")
    .eq("competition_id", competitionId);
  if (!teams || teams.length < 2) {
    return { error: "Add at least two teams first." };
  }

  // Where does the ladder stand? No placements means week 1 hasn't been seeded.
  const { data: placements } = await supabase
    .from("ladder_placements")
    .select("team_id, division_id, week, position")
    .eq("competition_id", competitionId)
    .order("week", { ascending: false });

  const latestWeek = (placements ?? []).reduce(
    (max, p) => Math.max(max, p.week as number),
    0,
  );

  let week: number;
  let rosters: { divisionId: string; teamIds: string[] }[];

  if (latestWeek === 0) {
    week = 1;
    rosters = divisions.map((d) => ({
      divisionId: d.id as string,
      teamIds: teams
        .filter((t) => t.division_id === d.id)
        .map((t) => t.id as string),
    }));
    const placed = rosters.flatMap((r) =>
      r.teamIds.map((teamId, i) => ({
        competition_id: competitionId,
        team_id: teamId,
        division_id: r.divisionId,
        week: 1,
        position: i,
      })),
    );
    if (placed.length === 0) return { error: "No teams are in a tier yet." };
    const { error: pErr } = await supabase
      .from("ladder_placements")
      .insert(placed);
    if (pErr) return { error: pErr.message };
  } else {
    week = latestWeek;
    const forWeek = (placements ?? []).filter((p) => p.week === week);
    rosters = divisions.map((d) => ({
      divisionId: d.id as string,
      teamIds: forWeek
        .filter((p) => p.division_id === d.id)
        .sort((a, b) => (a.position as number) - (b.position as number))
        .map((p) => p.team_id as string),
    }));
  }

  // Refuse to draw over games that already exist for this week.
  const { data: existing } = await supabase
    .from("matches")
    .select("id, status")
    .eq("competition_id", competitionId)
    .eq("round", week);
  if ((existing ?? []).some((m) => SETTLED.has(m.status as string))) {
    return { error: `Week ${week} already has results. Lock it to move on.` };
  }
  if ((existing ?? []).length > 0) {
    const { error: delErr } = await supabase
      .from("matches")
      .delete()
      .eq("competition_id", competitionId)
      .eq("round", week);
    if (delErr) return { error: delErr.message };
  }

  const courtList = (settings.court_list as LeagueCourt[] | null) ?? null;
  const hasCourtList = courtList != null && courtList.length > 0;
  const courtCount = hasCourtList ? courtList.length : slot.courts;

  const tz = (comp.timezone as string) ?? DEFAULT_TIMEZONE;
  const format = comp.match_format as MatchFormat;
  const blackouts = new Set((settings.blackout_dates as string[] | null) ?? []);

  // Week N is the Nth playing night, skipping blackout dates.
  let date = firstSlotDate(comp.start_date as string, slot.dayOfWeek);
  for (let n = 1; n < week; ) {
    date = DateTime.fromISO(date).plus({ days: 7 }).toISODate()!;
    if (!blackouts.has(date)) n += 1;
  }
  while (blackouts.has(date)) {
    date = DateTime.fromISO(date).plus({ days: 7 }).toISODate()!;
  }

  // In "sets" mode every game is a single set, so a set won IS a match won and
  // the night's ranking falls straight out of the normal standings logic.
  const perGameFormat: MatchFormat =
    settings.ladder_unit === "games"
      ? format
      : {
          ...format,
          bestOf: 1,
          setsToPoints: [format.setsToPoints?.[0] ?? 21],
        };

  const courtLabelAt = (n: number) =>
    hasCourtList
      ? courtList[Math.max(0, Math.min(courtList.length - 1, n - 1))].label
      : String(n);

  type Row = {
    competition_id: string;
    round: number;
    home_team_id: string;
    away_team_id: string;
    ref_team_id?: string | null;
    court: string;
    status: "scheduled";
    match_format: MatchFormat;
    scheduled_at: string;
  };

  /**
   * A tier that carries its own start time and slot length runs its own night
   * on its own court, and the tiers do not share a wave. A league that never
   * set those keeps the original shared-court packing.
   */
  const perTier = divisions.every(
    (d) => d.start_time != null && d.minutes_per_set != null,
  );

  let rows: Row[];
  let shorted: string[];

  if (perTier) {
    rows = [];
    shorted = [];
    for (const [i, d] of divisions.entries()) {
      const roster = rosters.find((r) => r.divisionId === (d.id as string));
      if (!roster || roster.teamIds.length < 2) continue;

      // `courts` holds the court NUMBERS this tier plays on; fall back to one
      // court per tier in tier order, which is what a two-court ladder means.
      const courtNumbers = (d.courts as number[] | null) ?? null;
      const courtNumber =
        courtNumbers && courtNumbers.length > 0 ? courtNumbers[0] : i + 1;

      const plan = planTierNight(
        {
          divisionId: d.id as string,
          teamIds: roster.teamIds,
          target:
            (d.ladder_target as number | null) ??
            (settings.ladder_target as number) ??
            6,
          minutesPerSet: d.minutes_per_set as number,
          court: courtLabelAt(courtNumber),
          lateStartSlots: (d.late_start_slots as number | null) ?? 0,
        },
        week,
      );
      shorted.push(...plan.shortedTeamIds);

      const startsAt = DateTime.fromISO(`${date}T${d.start_time as string}`, {
        zone: tz,
      });
      for (const m of plan.matches) {
        rows.push({
          competition_id: competitionId,
          round: week,
          home_team_id: m.homeTeamId,
          away_team_id: m.awayTeamId,
          ref_team_id: m.refTeamId,
          court: m.court,
          status: "scheduled",
          match_format: perGameFormat,
          scheduled_at: startsAt.plus({ minutes: m.offsetMinutes }).toISO()!,
        });
      }
    }
    if (rows.length === 0) {
      return { error: "No games to draw — check tier sizes and the targets." };
    }
  } else {
    const target = (settings.ladder_target as number) ?? 6;
    const plan = planLadderWeek(rosters, target, courtCount, week);
    if (plan.matches.length === 0) {
      return { error: "No games to draw — check tier sizes and the target." };
    }
    const gameMinutes =
      (settings.minutes_per_game as number | null) ??
      estimateMatchMinutes(format);
    shorted = plan.shortedTeamIds;
    // No division_id on matches — a game's tier is implied by its teams, the
    // same way the tiered round-robin generator does it.
    rows = plan.matches.map((m) => ({
      competition_id: competitionId,
      round: week,
      home_team_id: m.homeTeamId,
      away_team_id: m.awayTeamId,
      court: courtLabelAt(m.courtIndex),
      status: "scheduled" as const,
      match_format: perGameFormat,
      scheduled_at: DateTime.fromISO(`${date}T${slot.startTime}`, { zone: tz })
        .plus({ minutes: m.wave * gameMinutes })
        .toISO()!,
    }));
  }

  const { error: insErr } = await supabase.from("matches").insert(rows);
  if (insErr) return { error: insErr.message };

  revalidatePath("/orgs");
  if (comp.slug) revalidatePath(`/l/${comp.slug}`);
  return { week, matchCount: rows.length, shorted: shorted.length };
}

/**
 * Lock a week: rank each tier on that night alone, swap teams across the
 * boundaries, and write next week's placements.
 *
 * Every game must have a result first — moving teams on a half-played night
 * would relegate someone on a game they haven't lost yet.
 */
export async function lockLadderWeekAction(
  competitionId: string,
  week: number,
): Promise<
  ActionError | { nextWeek: number; moves: number; adjusted: number }
> {
  const parsed = lockLadderWeekSchema.safeParse({ competitionId, week });
  if (!parsed.success) return { error: "Unknown league or week." };

  const { supabase, comp, settings, divisions } =
    await loadLadderContext(competitionId);
  if (!comp || !settings) return { error: "League not found." };
  if (settings.ladder_enabled !== true) {
    return { error: "This league isn't set up as a ladder." };
  }

  const { data: placements } = await supabase
    .from("ladder_placements")
    .select("team_id, division_id, week, position")
    .eq("competition_id", competitionId)
    .eq("week", week);
  if (!placements || placements.length === 0) {
    return { error: `Week ${week} hasn't been drawn yet.` };
  }

  const { data: nextExisting } = await supabase
    .from("ladder_placements")
    .select("id")
    .eq("competition_id", competitionId)
    .eq("week", week + 1)
    .limit(1);
  if ((nextExisting ?? []).length > 0) {
    return { error: `Week ${week} is already locked.` };
  }

  const { data: matches } = await supabase
    .from("matches")
    .select("id, status, home_team_id, away_team_id")
    .eq("competition_id", competitionId)
    .eq("round", week);
  if (!matches || matches.length === 0) {
    return { error: `Week ${week} has no games.` };
  }
  const unplayed = matches.filter((m) => !SETTLED.has(m.status as string));
  if (unplayed.length > 0) {
    return {
      error: `${unplayed.length} game${unplayed.length === 1 ? "" : "s"} still need a score before this week can be locked.`,
    };
  }

  const { data: sets } = await supabase
    .from("sets")
    .select("match_id, home_score, away_score, set_number")
    .in(
      "match_id",
      matches.map((m) => m.id as string),
    );
  const setsByMatch = new Map<string, { home: number; away: number }[]>();
  for (const s of (sets ?? []).sort(
    (a, b) => (a.set_number as number) - (b.set_number as number),
  )) {
    const list = setsByMatch.get(s.match_id as string) ?? [];
    list.push({
      home: s.home_score as number,
      away: s.away_score as number,
    });
    setsByMatch.set(s.match_id as string, list);
  }

  const results: MatchResult[] = matches
    .filter((m) => m.home_team_id && m.away_team_id)
    .map((m) => ({
      matchId: m.id as string,
      homeTeamId: m.home_team_id as string,
      awayTeamId: m.away_team_id as string,
      sets: setsByMatch.get(m.id as string) ?? [],
    }));

  const rosters = divisions.map((d) => ({
    divisionId: d.id as string,
    teamIds: placements
      .filter((p) => p.division_id === d.id)
      .sort((a, b) => (a.position as number) - (b.position as number))
      .map((p) => p.team_id as string),
  }));

  const mode = ((settings.tiebreaker as string) ?? "ova") as RankMode;
  const ranked = rankLadderNight(rosters, results, mode);
  const swaps = (settings.ladder_swaps as number[] | null) ?? [];
  const moved = applyLadderMovement(ranked, { swaps });

  const nextWeek = week + 1;
  const rows = moved.tiers.flatMap((t) =>
    t.teamIds.map((teamId, i) => ({
      competition_id: competitionId,
      team_id: teamId,
      division_id: t.divisionId,
      week: nextWeek,
      position: i,
    })),
  );
  const { error: insErr } = await supabase
    .from("ladder_placements")
    .insert(rows);
  if (insErr) return { error: insErr.message };

  // Keep teams.division_id in step so the rest of the app (rosters, the public
  // page, registration) sees a team's CURRENT tier without knowing about weeks.
  for (const move of moved.moves) {
    const { error } = await supabase
      .from("teams")
      .update({ division_id: move.toDivisionId })
      .eq("id", move.teamId);
    if (error) return { error: error.message };
  }

  revalidatePath("/orgs");
  if (comp.slug) revalidatePath(`/l/${comp.slug}`);
  return {
    nextWeek,
    moves: moved.moves.length,
    adjusted: moved.adjusted.length,
  };
}

/**
 * Undo the most recent lock: drop the week's placements and put teams back.
 * For the organizer who locked a week before a late score came in.
 */
export async function unlockLadderWeekAction(
  competitionId: string,
  week: number,
): Promise<ActionError | { success: true }> {
  const parsed = lockLadderWeekSchema.safeParse({ competitionId, week });
  if (!parsed.success) return { error: "Unknown league or week." };

  const supabase = await createClient();

  // Only the newest week can be undone — unwinding further would need every
  // later week redrawn, and those games may already have been played.
  const { data: later } = await supabase
    .from("ladder_placements")
    .select("week")
    .eq("competition_id", competitionId)
    .gt("week", week + 1)
    .limit(1);
  if ((later ?? []).length > 0) {
    return { error: "A later week is already locked. Undo that one first." };
  }

  const { data: nextPlacements } = await supabase
    .from("ladder_placements")
    .select("team_id, division_id")
    .eq("competition_id", competitionId)
    .eq("week", week + 1);
  if (!nextPlacements || nextPlacements.length === 0) {
    return { error: "That week isn't locked." };
  }

  const { error: delErr } = await supabase
    .from("ladder_placements")
    .delete()
    .eq("competition_id", competitionId)
    .eq("week", week + 1);
  if (delErr) return { error: delErr.message };

  // Put every team back in the tier it played that week in.
  const { data: thisWeek } = await supabase
    .from("ladder_placements")
    .select("team_id, division_id")
    .eq("competition_id", competitionId)
    .eq("week", week);
  for (const p of thisWeek ?? []) {
    const { error } = await supabase
      .from("teams")
      .update({ division_id: p.division_id })
      .eq("id", p.team_id as string);
    if (error) return { error: error.message };
  }

  revalidatePath("/orgs");
  return { success: true };
}
