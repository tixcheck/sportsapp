/**
 * Net duty for leagues that turned it on (0179): match id → the team that puts
 * the net up before that game, and → the team that takes it down after it
 * (the last game on the court). Worked out from the live schedule on every
 * read, like standings, so a moved game or a redraw is reflected at once.
 *
 * BVL's 6-team round grids already name a nets team per first game
 * (Theresa's sheet); those picks are kept as published and the rest of the
 * league is balanced around them.
 */
import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  bvlTemplate,
  gridStyleOf,
  roundWeeksOf,
} from "@/lib/scheduler/bvl-round";
import {
  assignNetDuty,
  assignNetTakedown,
  type NetDutyGame,
} from "@/lib/scheduler/net-duty";
import { fetchAll } from "@/lib/supabase/fetch-all";

export interface NetDuty {
  /** Match id → the team that puts its court's net up before it. */
  setup: Map<string, string>;
  /** Match id → the team that takes its court's net down after it. */
  takedown: Map<string, string>;
}

export async function loadNetDuty(
  supabase: SupabaseClient,
  competitionIds: string[],
  /** Preview leagues that haven't switched it on (scripts, the settings preview). */
  opts: { includeOff?: boolean } = {},
): Promise<NetDuty> {
  const out: NetDuty = { setup: new Map(), takedown: new Map() };
  if (competitionIds.length === 0) return out;
  const { data: settings } = await supabase
    .from("league_settings")
    .select(
      "competition_id, net_duty, ladder_draw, ladder_round_weeks, ladder_round_grid",
    )
    .in("competition_id", competitionIds);
  const on = (settings ?? []).filter((s) => opts.includeOff || s.net_duty);
  if (on.length === 0) return out;
  const ids = on.map((s) => s.competition_id as string);

  const [{ data: comps }, matches, placements] = await Promise.all([
    supabase.from("competitions").select("id, timezone").in("id", ids),
    fetchAll<Record<string, unknown>>((from, to) =>
      supabase
        .from("matches")
        .select(
          "id, competition_id, round, division_id, venue_id, court, scheduled_at, home_team_id, away_team_id",
        )
        .in("competition_id", ids)
        .not("scheduled_at", "is", null)
        .order("id")
        .range(from, to),
    ),
    fetchAll<Record<string, unknown>>((from, to) =>
      supabase
        .from("ladder_placements")
        .select("id, competition_id, week, division_id, team_id, position")
        .in("competition_id", ids)
        .order("id")
        .range(from, to),
    ),
  ]);
  // Other leagues in the same gyms (0179 follow-up, 2026-10-24): a net they
  // use right before or after one of ours is shared, not put up or taken down.
  const gyms = [
    ...new Set(matches.map((m) => m.venue_id as string | null)),
  ].filter((v): v is string => !!v);
  const times = matches.map((m) => m.scheduled_at as string).sort();
  const neighbours =
    gyms.length === 0
      ? []
      : await fetchAll<Record<string, unknown>>((from, to) =>
          supabase
            .from("matches")
            .select("id, competition_id, venue_id, court, scheduled_at")
            .in("venue_id", gyms)
            .not("competition_id", "in", `(${ids.join(",")})`)
            .gte("scheduled_at", times[0])
            .lte("scheduled_at", times[times.length - 1])
            .order("id")
            .range(from, to),
        );

  const zoneOf = new Map(
    (comps ?? []).map((c) => [
      c.id as string,
      (c.timezone as string | null) ?? "America/Toronto",
    ]),
  );

  for (const s of on) {
    const cid = s.competition_id as string;
    const zone = zoneOf.get(cid) ?? "America/Toronto";
    const isRound = s.ladder_draw === "bvl_round";
    const roundLen = (s.ladder_round_weeks as number | null) ?? 1;
    const mine = matches.filter((m) => m.competition_id === cid);

    const games: NetDutyGame[] = mine.map((m) => {
      const at = DateTime.fromISO(m.scheduled_at as string, {
        zone: "utc",
      }).setZone(zone);
      const round = m.round as number | null;
      const night = at.toISODate() ?? "";
      return {
        id: m.id as string,
        gym: (m.venue_id as string | null) ?? "none",
        night,
        court: (m.court as string | null) ?? "",
        startsAt: m.scheduled_at as string,
        homeTeamId: m.home_team_id as string | null,
        awayTeamId: m.away_team_id as string | null,
        // A BVL round is balanced as a whole; anything else night by night.
        window:
          isRound && round != null
            ? `r${String(round >= 1 ? Math.ceil(round / roundLen) : 0).padStart(4, "0")}`
            : night,
      };
    });

    const others = [
      ...neighbours,
      ...matches.filter((m) => m.competition_id !== cid && m.venue_id),
    ].map((m) => ({
      gym: m.venue_id as string,
      night:
        DateTime.fromISO(m.scheduled_at as string, { zone: "utc" })
          .setZone(zone)
          .toISODate() ?? "",
      court: (m.court as string | null) ?? "",
      startsAt: m.scheduled_at as string,
    }));

    const fixed = isRound
      ? publishedPicks(
          mine,
          placements.filter((p) => p.competition_id === cid),
          roundLen,
          s.ladder_round_grid as string | null,
        )
      : new Map<string, string>();

    const setup = assignNetDuty(games, { fixed, others });
    for (const [gameId, teamId] of setup) out.setup.set(gameId, teamId);
    for (const [gameId, teamId] of assignNetTakedown(games, {
      avoid: setup,
      others,
    }))
      out.takedown.set(gameId, teamId);
  }
  return out;
}

/** The nets teams BVL's round grid names for each tier and week (Women's 6-team tiers). */
function publishedPicks(
  matches: Record<string, unknown>[],
  placements: Record<string, unknown>[],
  roundLen: number,
  grid: string | null,
): Map<string, string> {
  const fixed = new Map<string, string>();
  for (const m of matches) {
    const week = m.round as number | null;
    if (week == null || week < 1 || !m.division_id) continue;
    const weeks = roundWeeksOf(week, roundLen);
    const seats = placements
      .filter((p) => p.week === weeks[0] && p.division_id === m.division_id)
      .sort((a, b) => (a.position as number) - (b.position as number))
      .map((p) => p.team_id as string);
    const nets =
      bvlTemplate(seats.length, gridStyleOf(grid))?.weeks[
        weeks.indexOf(week) % 2
      ]?.nets ?? [];
    const netTeams = new Set(nets.map((n) => seats[n - 1]));
    const home = m.home_team_id as string | null;
    const away = m.away_team_id as string | null;
    const pick = home && netTeams.has(home) ? home : away;
    if (pick && netTeams.has(pick)) fixed.set(m.id as string, pick);
  }
  return fixed;
}

/** Whether a league names net-duty teams (0179). */
export async function getNetDutyOn(competitionId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("league_settings")
    .select("net_duty")
    .eq("competition_id", competitionId)
    .maybeSingle();
  return data?.net_duty === true;
}
