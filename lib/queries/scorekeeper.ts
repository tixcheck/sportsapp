import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";
import { pickScoreDay } from "@/lib/schedule/score-day";

/**
 * A scorekeeper's view of one league (0168): one night's games, by start
 * time, each with its score or an "Enter score" link. Read with the viewer's
 * own client — RLS (`can_view_schedule`) is what lets a scorekeeper see a
 * gated league's games at all.
 */
export interface ScoreGame {
  id: string;
  at: string | null;
  court: string | null;
  venue: string | null;
  home: string | null;
  away: string | null;
  status: string;
  /** "25–20, 21–25" once anything is entered. */
  score: string | null;
}

export interface ScorekeeperNight {
  competitionId: string;
  name: string;
  timezone: string;
  role: "admin" | "scorekeeper";
  days: string[];
  day: string | null;
  games: ScoreGame[];
}

export async function getScorekeeperNight(
  competitionId: string,
  requestedDay: string | null,
): Promise<ScorekeeperNight | null> {
  const supabase = await createClient();
  const [{ data: isAdmin }, { data: isScorekeeper }] = await Promise.all([
    supabase.rpc("is_competition_admin", { _competition_id: competitionId }),
    supabase.rpc("is_competition_scorekeeper", {
      _competition_id: competitionId,
    }),
  ]);
  if (isAdmin !== true && isScorekeeper !== true) return null;

  const [{ data: comp }, { data: matches }] = await Promise.all([
    supabase
      .from("competitions")
      .select("name, timezone")
      .eq("id", competitionId)
      .maybeSingle(),
    supabase
      .from("matches")
      .select(
        "id, scheduled_at, court, status, home_team_id, away_team_id, venue_id",
      )
      .eq("competition_id", competitionId)
      .order("scheduled_at", { ascending: true })
      .order("court", { ascending: true }),
  ]);
  const zone = (comp?.timezone as string | null) ?? "America/Toronto";
  const localDay = (iso: string) =>
    DateTime.fromISO(iso, { zone }).toFormat("yyyy-MM-dd");

  const all = matches ?? [];
  const days = [
    ...new Set(
      all
        .filter((m) => m.scheduled_at)
        .map((m) => localDay(m.scheduled_at as string)),
    ),
  ].sort();
  const today = DateTime.now().setZone(zone).toFormat("yyyy-MM-dd");
  const day =
    requestedDay && days.includes(requestedDay)
      ? requestedDay
      : pickScoreDay(days, today);
  const tonight = all.filter(
    (m) => m.scheduled_at && localDay(m.scheduled_at as string) === day,
  );

  const teamIds = [
    ...new Set(
      tonight.flatMap((m) => [m.home_team_id, m.away_team_id]).filter(Boolean),
    ),
  ] as string[];
  const venueIds = [
    ...new Set(tonight.map((m) => m.venue_id).filter(Boolean)),
  ] as string[];
  const [{ data: teams }, { data: venues }, { data: sets }] = await Promise.all(
    [
      teamIds.length
        ? supabase.from("teams").select("id, name").in("id", teamIds)
        : Promise.resolve({ data: [] }),
      venueIds.length
        ? supabase.from("venues").select("id, name").in("id", venueIds)
        : Promise.resolve({ data: [] }),
      tonight.length
        ? supabase
            .from("sets")
            .select("match_id, set_number, home_score, away_score")
            .in(
              "match_id",
              tonight.map((m) => m.id),
            )
            .order("set_number", { ascending: true })
        : Promise.resolve({ data: [] }),
    ],
  );
  const teamName = new Map(
    ((teams ?? []) as { id: string; name: string }[]).map((t) => [
      t.id,
      t.name,
    ]),
  );
  const venueName = new Map(
    ((venues ?? []) as { id: string; name: string }[]).map((v) => [
      v.id,
      v.name,
    ]),
  );
  const setsBy = new Map<string, string[]>();
  for (const s of (sets ?? []) as {
    match_id: string;
    home_score: number;
    away_score: number;
  }[]) {
    setsBy.set(s.match_id, [
      ...(setsBy.get(s.match_id) ?? []),
      `${s.home_score}–${s.away_score}`,
    ]);
  }

  return {
    competitionId,
    name: (comp?.name as string | null) ?? "League",
    timezone: zone,
    role: isAdmin === true ? "admin" : "scorekeeper",
    days,
    day,
    games: tonight.map((m) => ({
      id: m.id as string,
      at: m.scheduled_at as string | null,
      court: m.court as string | null,
      venue: m.venue_id ? (venueName.get(m.venue_id as string) ?? null) : null,
      home: m.home_team_id
        ? (teamName.get(m.home_team_id as string) ?? null)
        : null,
      away: m.away_team_id
        ? (teamName.get(m.away_team_id as string) ?? null)
        : null,
      status: m.status as string,
      score: setsBy.get(m.id as string)?.join(", ") ?? null,
    })),
  };
}
