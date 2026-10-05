"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";
import { planTierNight } from "@/lib/scheduler/ladder-night";
import { tierStartForWeek } from "@/lib/scheduler/wave-swap";
import { planLadderWeek, rankLadderNight } from "@/lib/scheduler/ladder-week";
import { applyLadderMovement } from "@/lib/scheduler/ladder-movement";
import {
  firstPlayingNight,
  nextPlayingNight,
  planPodNight,
} from "@/lib/scheduler/pod-night";
import { typedTierOrder } from "@/lib/scheduler/ladder-results";
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
          "ladder_enabled, ladder_unit, ladder_target, ladder_swaps, ladder_draw, weekly_slots, court_list, minutes_per_game, blackout_dates, tiebreaker, wave_swap_weeks",
        )
        .eq("competition_id", competitionId)
        .single(),
      supabase
        .from("divisions")
        .select(
          "id, name, tier_order, venue_id, courts, ladder_target, minutes_per_set, start_time, late_start_slots",
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

  // Seed order, so week 1 seats each tier the way the organizer seeded it — a
  // pinned grid binds A to whoever sits first, and the duty lines follow A.
  const { data: teams } = await supabase
    .from("teams")
    .select("id, division_id")
    .eq("competition_id", competitionId)
    .order("seed", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
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
    .select("id, status, scheduled_at")
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

  if (settings.ladder_draw === "pod_grid") {
    return drawPodWeek({
      supabase,
      competitionId,
      slug: (comp.slug as string | null) ?? null,
      week,
      rosters,
      divisions,
      timezone: (comp.timezone as string) ?? DEFAULT_TIMEZONE,
      startDate: comp.start_date as string,
      dayOfWeek: slot.dayOfWeek,
      blackouts: (settings.blackout_dates as string[] | null) ?? [],
      redrawnAt: (existing ?? []).map((m) => m.scheduled_at as string),
    });
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
    /**
     * The tier this game belongs to, recorded rather than inferred.
     *
     * It used to be left null on the reasoning that a game's tier is implied
     * by its teams. That holds for exactly as long as nobody moves — which in
     * a ladder is one week. After a promotion the same fixture reads as
     * belonging to whichever tier its teams landed in, so a drawn night
     * becomes unreadable the moment it is locked.
     */
    division_id: string;
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

      // Early and late waves trade places every N weeks where the league
      // asks for it (0150) — Mango Tuesdays, every 3, from Oct 13.
      const start = tierStartForWeek(
        d.start_time as string,
        divisions.map((x) => x.start_time as string),
        week,
        (settings.wave_swap_weeks as number | null) ?? null,
      );
      const startsAt = DateTime.fromISO(`${date}T${start}`, {
        zone: tz,
      });
      for (const m of plan.matches) {
        rows.push({
          competition_id: competitionId,
          round: week,
          division_id: d.id as string,
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
    // `planLadderWeek` already knows which tier each game came from, so record
    // it. Inferring it later from the teams breaks as soon as anyone is
    // promoted — see the note on `Row.division_id`.
    rows = plan.matches.map((m) => ({
      competition_id: competitionId,
      round: week,
      division_id: m.divisionId,
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

/** Local calendar date of an instant, in the league's zone. */
function localDate(instant: string, zone: string): string {
  return DateTime.fromISO(instant, { zone: "utc" }).setZone(zone).toISODate()!;
}

/**
 * Draw a week on pinned grids (`ladder_draw = 'pod_grid'`).
 *
 * The night's DATE is the only thing worked out, and it is taken from the
 * matches rather than the calendar wherever they exist: a redraw keeps the
 * night it replaces, and a new week is a week after the night the last one
 * actually ran. Only the very first week reads the season's start date.
 */
async function drawPodWeek(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  competitionId: string;
  slug: string | null;
  week: number;
  rosters: { divisionId: string; teamIds: string[] }[];
  divisions: { id: unknown; name: unknown; venue_id?: unknown }[];
  timezone: string;
  startDate: string;
  dayOfWeek: number;
  blackouts: string[];
  /** Start times of the games this draw replaced, if it is a redraw. */
  redrawnAt: string[];
}): Promise<
  ActionError | { week: number; matchCount: number; shorted: number }
> {
  const { supabase, competitionId, week, timezone: zone } = input;

  let night: string;
  if (input.redrawnAt.length > 0) {
    night = localDate([...input.redrawnAt].sort()[0], zone);
  } else {
    const { data: previous } = await supabase
      .from("matches")
      .select("scheduled_at")
      .eq("competition_id", competitionId)
      .eq("round", week - 1)
      .not("scheduled_at", "is", null)
      .order("scheduled_at", { ascending: false })
      .limit(1);
    const last = previous?.[0]?.scheduled_at as string | undefined;
    night = last
      ? nextPlayingNight(localDate(last, zone), input.blackouts)
      : firstPlayingNight(input.startDate, input.dayOfWeek, input.blackouts);
  }

  const venueOf = new Map(
    input.divisions.map((d) => [
      d.id as string,
      (d.venue_id as string | null) ?? null,
    ]),
  );
  const plan = planPodNight(
    input.rosters
      .filter((r) => r.teamIds.length > 0)
      .map((r) => ({
        divisionId: r.divisionId,
        venueId: venueOf.get(r.divisionId) ?? null,
        teamIds: r.teamIds,
      })),
  );
  if (plan.problems.length > 0) {
    const nameOf = new Map(
      input.divisions.map((d) => [d.id as string, d.name as string]),
    );
    const p = plan.problems[0];
    return {
      error: `${nameOf.get(p.divisionId) ?? "A tier"} has ${p.reason.replace(/^no pinned grid for /, "")}, and there is no grid for that size. Nothing was drawn.`,
    };
  }
  if (plan.fixtures.length === 0) return { error: "No games to draw." };

  const rows = plan.fixtures.map((f) => ({
    competition_id: competitionId,
    round: week,
    division_id: f.divisionId,
    venue_id: f.venueId,
    home_team_id: f.homeTeamId,
    away_team_id: f.awayTeamId,
    court: f.court,
    status: "scheduled" as const,
    scheduled_at: DateTime.fromISO(night, { zone })
      .set({ hour: f.hour, minute: f.minute })
      .toISO()!,
  }));

  const { error } = await supabase.from("matches").insert(rows);
  if (error) return { error: error.message };

  revalidatePath("/orgs");
  if (input.slug) revalidatePath(`/l/${input.slug}`);
  return { week, matchCount: rows.length, shorted: 0 };
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
    .select("team_id, division_id, week, position, result_rank, result_points")
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

  const rosters = divisions.map((d) => ({
    divisionId: d.id as string,
    name: d.name as string,
    teamIds: placements
      .filter((p) => p.division_id === d.id)
      .sort((a, b) => (a.position as number) - (b.position as number))
      .map((p) => p.team_id as string),
  }));

  // A tier whose final standings were typed in is ranked by them and needs no
  // scores; a tier with none typed is ranked from its games, as every ladder
  // was before. A tier with SOME typed is refused — see typedTierOrder.
  const typed = new Map<string, string[]>();
  for (const r of rosters) {
    const order = typedTierOrder(
      r.teamIds,
      placements
        .filter((p) => p.division_id === r.divisionId)
        .map((p) => ({
          teamId: p.team_id as string,
          rank: (p.result_rank as number | null) ?? null,
          points: (p.result_points as number | null) ?? null,
        })),
    );
    if (order.status === "complete")
      typed.set(r.divisionId, order.rankedTeamIds);
    else if (order.status === "partial") {
      return {
        error: `${r.name} has standings for ${order.entered} of ${order.of} teams. Finish them, or clear them to rank from scores.`,
      };
    } else if (order.status === "invalid") {
      return { error: `${r.name}'s standings don't add up: ${order.reason}.` };
    }
  }

  const scored = rosters.filter((r) => !typed.has(r.divisionId));
  let results: MatchResult[] = [];

  if (scored.length > 0) {
    const { data: allMatches } = await supabase
      .from("matches")
      .select("id, status, division_id, home_team_id, away_team_id")
      .eq("competition_id", competitionId)
      .eq("round", week);
    // Games recorded against a typed tier don't need a score. An older game
    // with no tier recorded can't be placed, so it still has to be settled.
    const matches = (allMatches ?? []).filter(
      (m) => m.division_id == null || !typed.has(m.division_id as string),
    );
    if (matches.length === 0) {
      const missing = scored.map((r) => r.name).join(", ");
      return {
        error: `Week ${week} has no scores or standings for ${missing}.`,
      };
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

    results = matches
      .filter((m) => m.home_team_id && m.away_team_id)
      .map((m) => ({
        matchId: m.id as string,
        homeTeamId: m.home_team_id as string,
        awayTeamId: m.away_team_id as string,
        sets: setsByMatch.get(m.id as string) ?? [],
      }));
  }

  const mode = ((settings.tiebreaker as string) ?? "ova") as RankMode;
  const fromScores = new Map(
    rankLadderNight(scored, results, mode).map((t) => [
      t.divisionId,
      t.rankedTeamIds,
    ]),
  );
  const ranked = rosters.map((r) => ({
    divisionId: r.divisionId,
    rankedTeamIds: typed.get(r.divisionId) ?? fromScores.get(r.divisionId)!,
  }));
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
 * Undo the most recent lock: drop the next week's placements AND the fixtures
 * drawn from them, and put teams back in the tier they played in.
 *
 * For the organizer who locked a week before a late score came in.
 *
 * The fixtures go too because they are derived from exactly the placements
 * being removed. Leaving them behind is what bit Mango on 2026-09-23: week 2
 * had already been drawn when week 1 was unlocked and re-locked under a
 * corrected tiebreaker, and the surviving fixtures still paired teams by the
 * old ladder — internally consistent, completely wrong, and with nothing on
 * screen to say so. Redrawing is a click; noticing was four queries.
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

  const { data: nextMatches } = await supabase
    .from("matches")
    .select("id, status")
    .eq("competition_id", competitionId)
    .eq("round", week + 1);

  // Scores are never discarded by an undo. If the next week has already been
  // played, the organizer has to deal with that deliberately — losing results
  // to a button meant for "I locked too early" would be the worse accident.
  if ((nextMatches ?? []).some((m) => SETTLED.has(m.status as string))) {
    return {
      error: `Week ${week + 1} already has results, so undoing week ${week} would discard them. Clear those scores first.`,
    };
  }

  const { error: delErr } = await supabase
    .from("ladder_placements")
    .delete()
    .eq("competition_id", competitionId)
    .eq("week", week + 1);
  if (delErr) return { error: delErr.message };

  // The drawn night goes with the ladder it was drawn from.
  if ((nextMatches ?? []).length > 0) {
    const { error: matchErr } = await supabase
      .from("matches")
      .delete()
      .eq("competition_id", competitionId)
      .eq("round", week + 1);
    if (matchErr) return { error: matchErr.message };
  }

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
