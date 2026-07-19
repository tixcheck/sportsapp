"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";
import {
  planMidSeasonSchedule,
  pairKey,
  type PlannedMatch,
} from "@/lib/scheduler/mid-season";
import { addTeamsMidSeasonSchema } from "@/lib/validations/league";
import type { WeeklySlot } from "@/lib/db/schema";

const DEFAULT_TIMEZONE = "America/Toronto";

/** Statuses that mean a game has been played — never regenerated. */
const SETTLED = new Set(["in_progress", "completed", "forfeit"]);

export type MidSeasonInputArgs = {
  competitionId: string;
  /** "A" = new pairs play what the weeks allow; "B" = catch them up to target. */
  mode: "A" | "B";
};

export type MidSeasonPreview = {
  newTeamNames: string[];
  /** Games created, and how many currently-unplayed games they replace. */
  created: number;
  replacing: number;
  playedFrozen: number;
  finalGames: { teamName: string; games: number; isNew: boolean }[];
  /** New pairs that still fall short of the league's game target, if any. */
  shortfalls: { teamName: string; got: number; target: number }[];
  sample: { label: string; weekDate: string; makeup: boolean }[];
  makeups: number;
  incomplete: boolean;
};

type LoadedContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  timezone: string;
  slot: WeeklySlot;
  gameMinutes: number;
  courts: number;
  targetGames: number;
  teamName: Map<string, string>;
  newTeamIds: string[];
  remainingWeekDates: string[];
  unplayedMatchIds: string[];
  playedFrozen: number;
  firstNewRound: number;
  plan: ReturnType<typeof planMidSeasonSchedule>;
};

async function loadContext(
  args: MidSeasonInputArgs,
): Promise<{ error: string } | LoadedContext> {
  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: args.competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can add teams mid-season." };
  }

  const [{ data: comp }, { data: settings }, { data: teams }, { data: rows }] =
    await Promise.all([
      supabase
        .from("competitions")
        .select("timezone")
        .eq("id", args.competitionId)
        .single(),
      supabase
        .from("league_settings")
        .select(
          "weekly_slots, games_per_team, games_per_week, minutes_per_game, court_list",
        )
        .eq("competition_id", args.competitionId)
        .single(),
      supabase
        .from("teams")
        .select("id, name")
        .eq("competition_id", args.competitionId),
      supabase
        .from("matches")
        .select("id, scheduled_at, status, home_team_id, away_team_id, round")
        .eq("competition_id", args.competitionId),
    ]);

  if (!comp || !settings) return { error: "League settings not found." };
  const slot = (settings.weekly_slots as WeeklySlot[] | null)?.[0];
  if (!slot) return { error: "No weekly slot configured." };
  if (!teams || teams.length < 2) return { error: "Not enough teams." };

  const timezone = comp.timezone ?? DEFAULT_TIMEZONE;
  const gamesPerWeek = (settings.games_per_week as number | null) ?? 1;
  const gameMinutes = (settings.minutes_per_game as number | null) ?? 45;
  const courtList = settings.court_list as { name: string }[] | null;
  const courts = courtList?.length || slot.courts || 1;
  const teamName = new Map(
    teams.map((t) => [t.id as string, t.name as string]),
  );

  const matches = rows ?? [];
  const played = matches.filter((m) => SETTLED.has(m.status as string));
  const unplayed = matches.filter((m) => !SETTLED.has(m.status as string));

  // New games continue the round numbering after the played weeks, so they
  // group under real "Round N" headings (not "Unscheduled") in the by-round view.
  const firstNewRound =
    played.reduce(
      (max, m) => Math.max(max, (m.round as number | null) ?? 0),
      0,
    ) + 1;

  // New teams are the ones with no matches at all (just added to the roster).
  const teamsInSchedule = new Set<string>();
  for (const m of matches) {
    if (m.home_team_id) teamsInSchedule.add(m.home_team_id as string);
    if (m.away_team_id) teamsInSchedule.add(m.away_team_id as string);
  }
  const newTeamIds = teams
    .map((t) => t.id as string)
    .filter((id) => !teamsInSchedule.has(id));
  if (newTeamIds.length === 0) {
    return { error: "No newly added teams to schedule." };
  }

  // The remaining week slots are exactly the distinct dates of the unplayed
  // games (weeks not yet started), in the venue timezone.
  const localDate = (iso: string | null) =>
    iso ? DateTime.fromISO(iso, { zone: timezone }).toISODate() : null;
  const remainingWeekDates = [
    ...new Set(unplayed.map((m) => localDate(m.scheduled_at as string | null))),
  ]
    .filter((d): d is string => d !== null)
    .sort();
  if (remainingWeekDates.length === 0) {
    return { error: "No upcoming weeks left to schedule into." };
  }

  // Target games per team: the league's configured cap, else inferred from the
  // full week span (distinct dates across every match × games/week).
  const allDates = new Set(
    matches
      .map((m) => localDate(m.scheduled_at as string | null))
      .filter(Boolean),
  );
  const targetGames =
    (settings.games_per_team as number | null) ?? allDates.size * gamesPerWeek;

  const playedGamesByTeam: Record<string, number> = {};
  const playedPairs: string[] = [];
  for (const m of played) {
    const h = m.home_team_id as string | null;
    const a = m.away_team_id as string | null;
    if (h) playedGamesByTeam[h] = (playedGamesByTeam[h] ?? 0) + 1;
    if (a) playedGamesByTeam[a] = (playedGamesByTeam[a] ?? 0) + 1;
    if (h && a) playedPairs.push(pairKey(h, a));
  }

  let seed = 0;
  for (const ch of args.competitionId)
    seed = (seed * 31 + ch.charCodeAt(0)) | 0;

  const plan = planMidSeasonSchedule({
    teamIds: teams.map((t) => t.id as string),
    playedGamesByTeam,
    playedPairs,
    targetGames,
    remainingWeekDates,
    gamesPerWeek,
    makeupTeamIds: args.mode === "B" ? newTeamIds : undefined,
    seed: seed >>> 0,
  });

  return {
    supabase,
    timezone,
    slot,
    gameMinutes,
    courts,
    targetGames,
    teamName,
    newTeamIds,
    remainingWeekDates,
    unplayedMatchIds: unplayed.map((m) => m.id as string),
    playedFrozen: played.length,
    firstNewRound,
    plan,
  };
}

export async function previewAddTeamsMidSeasonAction(
  args: MidSeasonInputArgs,
): Promise<{ error: string } | MidSeasonPreview> {
  const parsed = addTeamsMidSeasonSchema.safeParse(args);
  if (!parsed.success) return { error: "Check your input." };

  const ctx = await loadContext(parsed.data);
  if ("error" in ctx) return ctx;
  const { plan, teamName, newTeamIds } = ctx;

  const newSet = new Set(newTeamIds);
  const label = (m: PlannedMatch) =>
    `${teamName.get(m.homeTeamId) ?? "?"} vs ${teamName.get(m.awayTeamId) ?? "?"}`;

  return {
    newTeamNames: newTeamIds.map((id) => teamName.get(id) ?? "New team"),
    created: plan.matches.length,
    replacing: ctx.unplayedMatchIds.length,
    playedFrozen: ctx.playedFrozen,
    finalGames: Object.entries(plan.finalGamesByTeam)
      .map(([id, games]) => ({
        teamName: teamName.get(id) ?? id,
        games,
        isNew: newSet.has(id),
      }))
      .sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.games - a.games),
    shortfalls: plan.shortfalls.map((s) => ({
      teamName: teamName.get(s.teamId) ?? s.teamId,
      got: s.got,
      target: s.target,
    })),
    sample: plan.matches.slice(0, 6).map((m) => ({
      label: label(m),
      weekDate: m.weekDate,
      makeup: m.makeup,
    })),
    makeups: plan.matches.filter((m) => m.makeup).length,
    incomplete: plan.incomplete,
  };
}

export async function addTeamsMidSeasonAction(
  args: MidSeasonInputArgs,
): Promise<{ error: string } | { created: number; replaced: number }> {
  const parsed = addTeamsMidSeasonSchema.safeParse(args);
  if (!parsed.success) return { error: "Check your input." };

  const ctx = await loadContext(parsed.data);
  if ("error" in ctx) return ctx;
  const { supabase, plan, slot, timezone, gameMinutes, courts } = ctx;

  if (plan.matches.length === 0) {
    return { error: "Nothing to schedule for the new teams." };
  }

  const rows = plan.matches.map((m, i) => {
    const at = DateTime.fromISO(`${m.weekDate}T${slot.startTime}`, {
      zone: timezone,
    }).plus({ minutes: m.wave * gameMinutes });
    return {
      competition_id: parsed.data.competitionId,
      home_team_id: m.homeTeamId,
      away_team_id: m.awayTeamId,
      status: "scheduled" as const,
      // Each slot is one round; continue numbering after the played weeks so the
      // games group under real "Round N" headings, not "Unscheduled".
      round: ctx.firstNewRound + m.slot,
      court: `Court ${(i % courts) + 1}`,
      scheduled_at: at.toUTC().toISO(),
    };
  });

  // Replace only the unplayed games; every settled game is left untouched.
  if (ctx.unplayedMatchIds.length > 0) {
    const { error: delErr } = await supabase
      .from("matches")
      .delete()
      .in("id", ctx.unplayedMatchIds);
    if (delErr) return { error: delErr.message };
  }

  const { error: insErr } = await supabase.from("matches").insert(rows);
  if (insErr) return { error: insErr.message };

  revalidatePath("/orgs");
  revalidatePath("/my-matches");
  return { created: rows.length, replaced: ctx.unplayedMatchIds.length };
}
