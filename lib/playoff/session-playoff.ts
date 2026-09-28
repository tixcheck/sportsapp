import type { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";

import type { LeagueCourt, MatchFormat } from "@/lib/db/schema";
import {
  planPlayoffNight,
  playoffFormat,
  playoffMatchFormat,
  seedingNights,
} from "@/lib/scheduler/playoff-formats";
import { playoffNightsFor } from "@/lib/stats/attendance";
import {
  parseRankMode,
  rankStandings,
  type MatchResult,
} from "@/lib/scheduler/tiebreakers";

/**
 * A playoff for one session of a league, on that session's playoff night.
 *
 * Server-only and client-agnostic: the organizer's action passes their own
 * client, so RLS decides what they may change; a trusted repair script can
 * pass another. Either way the same code draws the night.
 */

export interface SessionSeed {
  teamId: string;
  name: string;
  /** "3–0–3 · sets 9–3", for the organizer to check the order against. */
  record: string;
}

export interface SessionPlayoffNight {
  night: string;
  /** The earlier nights of this session, whose results seed it. */
  seedingNights: string[];
  seeds: SessionSeed[];
  /** A bracket already drawn for this night. */
  drawn: boolean;
  /** Games on this night that already have a score (regular or playoff). */
  scored: number;
}

type Row = {
  id: string;
  status: string;
  scheduled_at: string | null;
  bracket_position: number | null;
  playoff_session: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
};

async function load(supabase: SupabaseClient, competitionId: string) {
  const [
    { data: comp },
    { data: settings },
    { data: matches },
    { data: teams },
  ] = await Promise.all([
    supabase
      .from("competitions")
      .select("timezone, match_format, slug")
      .eq("id", competitionId)
      .maybeSingle(),
    supabase
      .from("league_settings")
      .select("session_nights, court_list, weekly_slots, tiebreaker")
      .eq("competition_id", competitionId)
      .maybeSingle(),
    supabase
      .from("matches")
      .select(
        "id, status, scheduled_at, bracket_position, playoff_session, home_team_id, away_team_id",
      )
      .eq("competition_id", competitionId),
    supabase
      .from("teams")
      .select("id, name, status")
      .eq("competition_id", competitionId),
  ]);
  const zone = (comp?.timezone as string | null) ?? "America/Toronto";
  const rows = (matches ?? []) as Row[];
  const nightOf = (iso: string | null) =>
    iso
      ? DateTime.fromISO(iso, { zone: "utc" }).setZone(zone).toISODate()
      : null;
  return { comp, settings, rows, teams: teams ?? [], zone, nightOf };
}

/** Every session playoff night in the league, each with its seeding. */
export async function getSessionPlayoffNights(
  supabase: SupabaseClient,
  competitionId: string,
): Promise<SessionPlayoffNight[]> {
  const { settings, rows, teams, nightOf } = await load(
    supabase,
    competitionId,
  );
  const sessionNights = (settings?.session_nights as number | null) ?? null;
  const regular = rows.filter((r) => r.bracket_position == null);
  const nights = [
    ...new Set(regular.map((r) => nightOf(r.scheduled_at)).filter(Boolean)),
  ] as string[];
  // A night keeps its place in the sessions after its round robin is replaced
  // by a playoff, so count playoff nights too.
  for (const r of rows) {
    if (r.playoff_session && !nights.includes(r.playoff_session)) {
      nights.push(r.playoff_session);
    }
  }
  const playoffNights = [...playoffNightsFor(nights, sessionNights)].sort();

  const { data: setRows } = await supabase
    .from("sets")
    .select("match_id, home_score, away_score, set_number")
    .in(
      "match_id",
      rows.map((r) => r.id),
    );
  const setsByMatch = new Map<string, { home: number; away: number }[]>();
  for (const s of (setRows ?? []).sort(
    (a, b) => (a.set_number as number) - (b.set_number as number),
  )) {
    const list = setsByMatch.get(s.match_id as string) ?? [];
    list.push({ home: s.home_score as number, away: s.away_score as number });
    setsByMatch.set(s.match_id as string, list);
  }

  const active = teams.filter((t) => t.status === "active");
  const name = new Map(active.map((t) => [t.id as string, t.name as string]));
  const mode = parseRankMode(settings?.tiebreaker as string | null);

  return playoffNights.map((night) => {
    const seeding = seedingNights(nights, sessionNights, night);
    const results: MatchResult[] = regular
      .filter(
        (r) =>
          r.status === "completed" &&
          r.home_team_id &&
          r.away_team_id &&
          seeding.includes(nightOf(r.scheduled_at) ?? ""),
      )
      .map((r) => ({
        matchId: r.id,
        homeTeamId: r.home_team_id!,
        awayTeamId: r.away_team_id!,
        sets: setsByMatch.get(r.id) ?? [],
      }));
    const ranked = rankStandings([...name.keys()], results, undefined, mode);
    const onNight = rows.filter(
      (r) =>
        (r.bracket_position == null && nightOf(r.scheduled_at) === night) ||
        r.playoff_session === night,
    );
    return {
      night,
      seedingNights: seeding,
      seeds: ranked.map((r) => ({
        teamId: r.teamId,
        name: name.get(r.teamId) ?? "Team",
        record: `${r.mw}–${r.ml}${r.mt ? `–${r.mt}` : ""} · sets ${r.sw}–${r.sl}`,
      })),
      drawn: rows.some((r) => r.playoff_session === night),
      scored: onNight.filter(
        (r) =>
          r.status === "completed" || (setsByMatch.get(r.id)?.length ?? 0) > 0,
      ).length,
    };
  });
}

/**
 * Draw a session playoff on its night.
 *
 * Replaces that night's regular games — the playoff IS the night — and any
 * earlier draw for the same night. Refuses once anything on the night has a
 * score: redrawing over a played game would throw away a result, and the
 * organizer should see that before it happens, not after.
 *
 * Inserts before deleting. Without a transaction a failure halfway through
 * should leave the night with both, which is visible and fixable, rather than
 * with neither.
 */
export async function drawSessionPlayoff(
  supabase: SupabaseClient,
  input: {
    competitionId: string;
    night: string;
    formatId: string;
    startTime: string;
    slotMinutes: number;
    /** Organizer's order, best first. Defaults to the session standings. */
    seeds?: string[];
  },
): Promise<{ error: string } | { games: number; seeds: string[] }> {
  const format = playoffFormat(input.formatId);
  if (!format) return { error: "Unknown playoff format." };

  const nights = await getSessionPlayoffNights(supabase, input.competitionId);
  const target = nights.find((n) => n.night === input.night);
  if (!target)
    return { error: "That isn't one of this league's playoff nights." };
  if (target.scored > 0) {
    return {
      error: `${target.scored} game${target.scored === 1 ? "" : "s"} on that night already ha${target.scored === 1 ? "s" : "ve"} a score, so it can't be redrawn.`,
    };
  }

  const standingsOrder = target.seeds.map((s) => s.teamId);
  const seeds = (input.seeds ?? standingsOrder).slice(0, format.teams);
  const eligible = new Set(standingsOrder);
  if (seeds.some((id) => !eligible.has(id))) {
    return { error: "A seeded team isn't in this league." };
  }

  const { comp, settings, rows, zone, nightOf } = await load(
    supabase,
    input.competitionId,
  );
  const courtList = (settings?.court_list as LeagueCourt[] | null) ?? [];
  const courts = courtList.length
    ? courtList.map((c) => c.label)
    : Array.from(
        {
          length:
            ((settings?.weekly_slots as { courts?: number }[] | null)?.[0]
              ?.courts as number | undefined) ?? 2,
        },
        (_, i) => `Court ${i + 1}`,
      );
  const venueOf = new Map(courtList.map((c) => [c.label, c.venueId ?? null]));

  let planned;
  try {
    planned = planPlayoffNight(format, seeds, {
      date: input.night,
      startTime: input.startTime,
      slotMinutes: input.slotMinutes,
      zone,
      courts,
    });
  } catch (e) {
    return { error: (e as Error).message };
  }

  const matchFormat = playoffMatchFormat(
    format,
    comp?.match_format as MatchFormat,
  );
  const { data: inserted, error: insErr } = await supabase
    .from("matches")
    .insert(
      planned.map((g) => ({
        competition_id: input.competitionId,
        round: g.round,
        bracket_position: g.position,
        playoff_session: input.night,
        home_team_id: g.homeTeamId,
        away_team_id: g.awayTeamId,
        court: g.court,
        venue_id: venueOf.get(g.court) ?? null,
        scheduled_at: g.scheduledAt,
        status: "scheduled",
        match_format: matchFormat,
      })),
    )
    .select("id");
  if (insErr) return { error: insErr.message };
  const keep = new Set((inserted ?? []).map((r) => r.id as string));

  const replaced = rows
    .filter(
      (r) =>
        !keep.has(r.id) &&
        ((r.bracket_position == null &&
          nightOf(r.scheduled_at) === input.night) ||
          r.playoff_session === input.night),
    )
    .map((r) => r.id);
  if (replaced.length > 0) {
    const { error: delErr } = await supabase
      .from("matches")
      .delete()
      .in("id", replaced);
    if (delErr) return { error: delErr.message };
  }

  return { games: planned.length, seeds };
}
