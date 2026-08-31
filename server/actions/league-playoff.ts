"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  leaguePlayoffProblem,
  planLeaguePlayoff,
  type PlayoffGame,
  type TeamSource,
} from "@/lib/scheduler/league-playoff";
import { loadStandings, type StandingsGroup } from "@/lib/standings/compute";
import type { MatchFormat } from "@/lib/db/schema";

type ActionError = { error: string };

const schema = z.object({
  competitionId: z.string().uuid(),
  /** How many teams make the championship bracket. */
  topCount: z.number().int().min(8).max(32),
  /** Playing nights, "YYYY-MM-DD", in order. Usually two. */
  dates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .min(1)
    .max(4),
  /** Local "HH:mm" the first wave starts. */
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  /** Minutes a game occupies — spaces the waves apart. */
  minutesPerGame: z.number().int().min(15).max(180),
});

export type GenerateLeaguePlayoffInput = z.input<typeof schema>;

/**
 * Draw a league's two-night playoff from the final standings.
 *
 * Seeded off the standings computed here rather than `standings_cache`: the
 * cache is a cache, and seeding a playoff is exactly the moment to derive the
 * table from the matches instead of trusting a copy of it.
 *
 * Replaces any existing playoff. Regular-season matches are untouched — this
 * only ever deletes rows that carry a bracket position.
 */
export async function generateLeaguePlayoffAction(
  input: GenerateLeaguePlayoffInput,
  options: { confirmName?: string } = {},
): Promise<
  | ActionError
  | { games: number; nights: number; top: number; bottom: number }
  | { needsConfirmation: true; played: number; name: string }
> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  }
  const { competitionId, topCount, dates, startTime, minutesPerGame } =
    parsed.data;

  const supabase = await createClient();
  const { data: isAdmin, error: checkErr } = await supabase.rpc(
    "is_competition_admin",
    { _competition_id: competitionId },
  );
  if (checkErr) {
    console.error("[playoff] permission check failed", checkErr.message);
    return { error: "That couldn't be saved. Please try again." };
  }
  if (isAdmin !== true) {
    return { error: "Only the organizer can draw the playoff." };
  }

  const { data: comp } = await supabase
    .from("competitions")
    .select("name, timezone, match_format")
    .eq("id", competitionId)
    .single();
  if (!comp) return { error: "League not found." };

  const { data: settings } = await supabase
    .from("league_settings")
    .select("court_list, weekly_slots")
    .eq("competition_id", competitionId)
    .maybeSingle();

  // Seeds come from the season table, best first.
  const groups: StandingsGroup[] = await loadStandings(supabase, competitionId);
  // Withdrawn teams are not entrants and must never be seeded into a playoff.
  const seeds = groups.flatMap((g) =>
    g.rows.filter((r) => !r.withdrawn).map((r) => r.teamId),
  );
  if (seeds.length === 0) {
    return { error: "No standings yet — play the season first." };
  }

  const problem = leaguePlayoffProblem(seeds.length, topCount);
  if (problem) return { error: problem };

  // Redrawing throws away recorded playoff scores, the same as regenerating a
  // season schedule does. Typing the name is the lock, for the same reason.
  const { data: scored } = await supabase
    .from("matches")
    .select("id, status")
    .eq("competition_id", competitionId)
    .not("bracket_position", "is", null)
    .eq("status", "completed");
  const played = (scored ?? []).length;
  if (
    played > 0 &&
    options.confirmName?.trim() !== (comp.name as string).trim()
  ) {
    return { needsConfirmation: true, played, name: comp.name as string };
  }

  const plan = planLeaguePlayoff({ seeds, topCount });

  const nightsNeeded = Math.max(...plan.games.map((g) => g.night));
  if (dates.length < nightsNeeded) {
    return {
      error: `This playoff needs ${nightsNeeded} nights — you gave ${dates.length}.`,
    };
  }

  // Courts come from the league's own list so the playoff sits on the same
  // floor the season did. Bare labels, matching how the season stores them.
  const courtList =
    (settings?.court_list as { label: string; prime: boolean }[] | null) ??
    null;
  const courts = courtList?.length
    ? courtList.map((c) => c.label)
    : Array.from(
        {
          length:
            (settings?.weekly_slots as { courts: number }[] | null)?.[0]
              ?.courts ?? 2,
        },
        (_, i) => String(i + 1),
      );

  const widest = Math.max(
    ...[1, 2, 3, 4].map((n) =>
      Math.max(
        0,
        ...[0, 1, 2].map(
          (w) => plan.games.filter((g) => g.night === n && g.wave === w).length,
        ),
      ),
    ),
  );
  if (widest > courts.length) {
    return {
      error: `One wave needs ${widest} courts and the league has ${courts.length}.`,
    };
  }

  const tz = (comp.timezone as string | null) ?? "America/Toronto";
  const seedTeam = (s: TeamSource) =>
    s.kind === "seed" ? (seeds[s.seed - 1] ?? null) : null;

  // Everything with a bracket position goes; the season stays.
  const { error: delErr } = await supabase
    .from("matches")
    .delete()
    .eq("competition_id", competitionId)
    .not("bracket_position", "is", null);
  if (delErr) return { error: delErr.message };

  // Prime courts first within each wave, so the games that matter most land on
  // the best floor. The final gets the first prime court of all.
  const ranked = courtList?.length
    ? [...courtList]
        .sort(
          (a, b) =>
            Number(b.prime) - Number(a.prime) ||
            // Numeric where the labels are numbers, so court 6 doesn't sort
            // after court 15 on a printed sheet.
            (Number(a.label) || 0) - (Number(b.label) || 0) ||
            a.label.localeCompare(b.label),
        )
        .map((c) => c.label)
    : courts;

  const importance = (g: PlayoffGame) =>
    g.label === "Final" ? 0 : g.track === "championship" ? 1 : 2;

  const rows = [] as Record<string, unknown>[];
  for (let night = 1; night <= nightsNeeded; night++) {
    for (const wave of [0, 1, 2]) {
      const inWave = plan.games
        .filter((g) => g.night === night && g.wave === wave)
        .sort(
          (a, b) =>
            importance(a) - importance(b) ||
            a.round - b.round ||
            a.position - b.position,
        );
      if (inWave.length === 0) continue;

      const at = DateTime.fromISO(`${dates[night - 1]}T${startTime}`, {
        zone: tz,
      }).plus({ minutes: wave * minutesPerGame });

      inWave.forEach((g, i) => {
        rows.push({
          competition_id: competitionId,
          round: g.round,
          bracket_position: g.position,
          bracket_track: g.track,
          home_team_id: seedTeam(g.home),
          away_team_id: seedTeam(g.away),
          status: "scheduled" as const,
          court: ranked[i % ranked.length],
          scheduled_at: at.isValid ? at.toISO() : null,
          match_format: comp.match_format as MatchFormat,
        });
      });
    }
  }

  const { error: insErr } = await supabase.from("matches").insert(rows);
  if (insErr) {
    console.error("[playoff] insert failed", insErr.message);
    return { error: insErr.message };
  }

  await supabase
    .from("competitions")
    .update({ status: "in_progress" })
    .eq("id", competitionId);

  revalidatePath("/orgs");
  return {
    games: rows.length,
    nights: nightsNeeded,
    top: plan.top.length,
    bottom: plan.bottom.length,
  };
}
