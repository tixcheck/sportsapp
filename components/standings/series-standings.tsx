"use client";

import { useState } from "react";
import { DateTime } from "luxon";

import type { MatchFormat } from "@/lib/db/schema";
import type { Sport } from "@/lib/formats";
import type { StandingsGroup } from "@/lib/standings/compute";
import type { SeriesStandings as Series } from "@/lib/queries/series-standings";
import { cn } from "@/lib/utils";
import {
  StandingsGroups,
  StandingsLegend,
  StandingsTable,
} from "@/components/standings/standings-table";

/**
 * Standings a mini series at a time, for a league that re-drafts in sessions.
 *
 * Opens on the current series: "going into the night, how is Team 2 doing,
 * and what record would we need to be the top seed?" is asked about THIS block
 * of nights, by people who were on a different Team 2 last month. The whole
 * season stays one tap away.
 */
export function SeriesStandings({
  series,
  current,
  season,
  myTeamIds = [],
  format,
  sport,
  differential = false,
  showPoints = false,
}: {
  series: Series[];
  /** 1-based number of the series to open on. */
  current: number;
  season: StandingsGroup[];
  myTeamIds?: string[];
  format?: MatchFormat;
  sport?: Sport;
  differential?: boolean;
  showPoints?: boolean;
}) {
  const [picked, setPicked] = useState<number | "season">(current);
  const chosen =
    picked === "season" ? null : series.find((s) => s.number === picked);
  const groups = chosen ? chosen.groups : season;

  return (
    <div className="space-y-4">
      <div className="bg-muted flex max-w-full flex-wrap gap-0.5 rounded-lg p-0.5">
        {series.map((s) => (
          <Pill
            key={s.number}
            active={picked === s.number}
            onClick={() => setPicked(s.number)}
          >
            {s.label}
          </Pill>
        ))}
        <Pill active={picked === "season"} onClick={() => setPicked("season")}>
          Whole season
        </Pill>
      </div>

      <p className="text-muted-foreground text-sm">
        {chosen
          ? `${chosen.label} · ${chosen.span}. Its regular nights only${
              chosen.playoffNight
                ? `; its playoff is ${DateTime.fromISO(
                    chosen.playoffNight,
                  ).toFormat("EEE LLL d")}`
                : ""
            }.`
          : "Every night of the season, across every series."}
      </p>

      {groups.length > 1 ? (
        <StandingsGroups
          groups={groups}
          showDivision={false}
          myTeamIds={myTeamIds}
          format={format}
          sport={sport}
          differential={differential}
          showPoints={showPoints}
        />
      ) : (
        <>
          <StandingsTable
            rows={groups[0]?.rows ?? []}
            myTeamIds={myTeamIds}
            format={format}
            sport={sport}
            differential={differential}
            showPoints={showPoints}
          />
          {(groups[0]?.rows.length ?? 0) > 0 && (
            <StandingsLegend
              format={format}
              sport={sport}
              differential={differential}
              showPoints={showPoints}
            />
          )}
        </>
      )}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
