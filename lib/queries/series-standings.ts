import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";
import { loadStandings, type StandingsGroup } from "@/lib/standings/compute";
import { currentSession, miniSeries } from "@/lib/schedule/sessions";

export interface SeriesStandings {
  number: number;
  /** "Series 2" */
  label: string;
  /** "Oct 9 – Oct 23" — its nights, playoff included. */
  span: string;
  /** Its playoff night, when it has one. */
  playoffNight: string | null;
  groups: StandingsGroup[];
}

/**
 * Standings for each mini series of a league that re-drafts in sessions.
 *
 * Only series that have started — a table of zeros for a block nobody has
 * played is noise — and each counts its own regular nights only. Null for a
 * league without sessions, which keeps its single season table.
 */
export async function getSeriesStandings(
  competitionId: string,
  today: string,
): Promise<{ series: SeriesStandings[]; current: number } | null> {
  const supabase = await createClient();
  const [{ data: comp }, { data: settings }, { data: matches }] =
    await Promise.all([
      supabase
        .from("competitions")
        .select("timezone, type")
        .eq("id", competitionId)
        .maybeSingle(),
      supabase
        .from("league_settings")
        .select("session_nights")
        .eq("competition_id", competitionId)
        .maybeSingle(),
      supabase
        .from("matches")
        .select("scheduled_at, playoff_session")
        .eq("competition_id", competitionId),
    ]);
  const sessionNights = (settings?.session_nights as number | null) ?? null;
  if (comp?.type !== "league" || !sessionNights || sessionNights < 2) {
    return null;
  }

  const zone = (comp.timezone as string | null) ?? "America/Toronto";
  const nights = [
    ...new Set(
      (matches ?? [])
        .map(
          (m) =>
            (m.playoff_session as string | null) ??
            (m.scheduled_at
              ? DateTime.fromISO(m.scheduled_at as string, { zone: "utc" })
                  .setZone(zone)
                  .toISODate()
              : null),
        )
        .filter((n): n is string => !!n),
    ),
  ].sort();

  const started = miniSeries(nights, sessionNights).filter(
    (s) => (s.regularNights[0] ?? s.playoffNight ?? "9999") <= today,
  );
  if (started.length === 0) return null;

  const label = (d: string) => DateTime.fromISO(d).toFormat("LLL d");
  const series = await Promise.all(
    started.map(async (s) => {
      const all = [
        ...s.regularNights,
        ...(s.playoffNight ? [s.playoffNight] : []),
      ];
      return {
        number: s.number,
        label: `Series ${s.number}`,
        span:
          all.length > 1
            ? `${label(all[0])} – ${label(all[all.length - 1])}`
            : label(all[0]),
        playoffNight: s.playoffNight,
        groups: await loadStandings(supabase, competitionId, {
          nights: s.regularNights,
        }),
      };
    }),
  );

  const now = currentSession(nights, sessionNights, today)?.number;
  const current = Math.min(now ?? series.length, series.length);
  return { series, current };
}
