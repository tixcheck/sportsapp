import type { StandingsRowView } from "@/lib/standings/compute";
import type { Sport } from "@/lib/formats";
import { sportConfig } from "@/lib/sports";
import { cn } from "@/lib/utils";
import { MyTeamBadge } from "@/components/team/my-team-badge";

import { PositionPill } from "./position-pill";

/**
 * The pared-down standings a league can choose (league_settings
 * .standings_columns = 'simple'): rank, team, sets won, sets lost, points
 * +/- and points ratio, nothing else. BVL asked for exactly these four
 * columns (2026-10-21); the order is still the league's full ranking.
 */
export function SimpleStandingsTable({
  rows,
  myTeamIds = [],
  sport,
}: {
  rows: StandingsRowView[];
  myTeamIds?: string[];
  sport?: Sport;
}) {
  const pts = sportConfig(sport ?? "indoor6").points;
  const th = "px-2 pb-2 text-center font-bold";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-ink-2 border-ink border-b-[1.5px] text-[0.66rem] tracking-[0.1em] uppercase">
            <th className="w-10 px-2 pb-2 text-center font-bold">#</th>
            <th className="px-3 pb-2 text-left font-bold">Team</th>
            <th title="Sets won" className={th}>
              SW
            </th>
            <th title="Sets lost" className={th}>
              SL
            </th>
            <th
              title={`${pts.unit}s for minus ${pts.unit.toLowerCase()}s against`}
              className={th}
            >
              +/-
            </th>
            <th
              title={`${pts.unit} ratio (${pts.short[0]} / ${pts.short[1]})`}
              className="px-3 pb-2 text-right font-bold"
            >
              Ratio
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const diff = r.pf - r.pa;
            return (
              <tr
                key={r.teamId}
                className={cn(
                  "border-rule h-12 border-b last:border-0",
                  myTeamIds.includes(r.teamId) && "bg-paper-sunken",
                )}
              >
                <td
                  className={cn(
                    "text-center",
                    r.position === 1 ? "text-claret" : "text-ink-2",
                  )}
                >
                  <div className="flex justify-center">
                    <PositionPill
                      position={r.position}
                      teamName={r.teamName}
                      explainer={r.explainer}
                    />
                  </div>
                </td>
                <td className="px-3">
                  <span
                    className={cn(
                      "font-semibold",
                      r.withdrawn && "text-ink-3 line-through",
                    )}
                  >
                    {r.teamName}
                  </span>
                  {myTeamIds.includes(r.teamId) && (
                    <MyTeamBadge className="ml-2" />
                  )}
                </td>
                <td className="text-ink px-2 text-center font-bold">{r.sw}</td>
                <td className="text-ink-3 px-2 text-center">{r.sl}</td>
                <td className="px-2 text-center">
                  {diff > 0 ? `+${diff}` : diff}
                </td>
                <td className="text-ink px-3 text-right font-semibold">
                  {Number.isFinite(r.pointRatio)
                    ? r.pointRatio.toFixed(3)
                    : "∞"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
