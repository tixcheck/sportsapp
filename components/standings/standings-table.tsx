import type { StandingsGroup, StandingsRowView } from "@/lib/standings/compute";
import { cn } from "@/lib/utils";
import { MyTeamBadge } from "@/components/team/my-team-badge";

import { PositionPill } from "./position-pill";

function fmt(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : "∞";
}

const STAT_COLS: {
  key: keyof StandingsRowView;
  label: string;
  hint: string;
}[] = [
  { key: "mw", label: "MW", hint: "Matches won" },
  { key: "ml", label: "ML", hint: "Matches lost" },
  { key: "sw", label: "SW", hint: "Sets won" },
  { key: "sl", label: "SL", hint: "Sets lost" },
  { key: "pf", label: "PF", hint: "Points for" },
  { key: "pa", label: "PA", hint: "Points against" },
];

export function StandingsTable({
  rows,
  myTeamIds = [],
}: {
  rows: StandingsRowView[];
  myTeamIds?: string[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        No results yet — standings appear once scores are confirmed.
      </p>
    );
  }

  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[34rem] text-sm tabular-nums">
        <thead>
          <tr className="text-muted-foreground border-border border-b text-xs">
            <th className="w-10 px-2 py-2 text-center font-medium">#</th>
            <th className="px-3 py-2 text-left font-medium">Team</th>
            {STAT_COLS.map((c) => (
              <th
                key={c.key as string}
                title={c.hint}
                className="px-2 py-2 text-center font-medium"
              >
                {c.label}
              </th>
            ))}
            <th
              title="Set ratio (SW / SL)"
              className="px-3 py-2 text-right font-medium"
            >
              Ratio
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.teamId}
              className="border-border/60 h-12 border-b last:border-0"
            >
              <td className="px-2 text-center">
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
                    "font-medium",
                    r.withdrawn && "text-muted-foreground line-through",
                  )}
                >
                  {r.teamName}
                </span>
                {r.withdrawn && (
                  <span className="bg-gold-300/40 text-coral-900 ml-2 rounded-full px-2 py-0.5 text-xs font-medium">
                    Withdrawn
                  </span>
                )}
                {myTeamIds.includes(r.teamId) && (
                  <MyTeamBadge className="ml-2" />
                )}
              </td>
              {STAT_COLS.map((c) => (
                <td
                  key={c.key as string}
                  className={cn(
                    "px-2 text-center",
                    c.key === "mw" && "text-coral-700 font-semibold",
                  )}
                >
                  {r[c.key] as number}
                </td>
              ))}
              <td className="text-foreground px-3 text-right font-medium">
                {fmt(r.setRatio)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Render standings grouped by pool/division (tournament) — each group gets a
 * heading. A division heading is shown only when more than one division exists.
 */
export function StandingsGroups({
  groups,
  showDivision,
  myTeamIds = [],
}: {
  groups: StandingsGroup[];
  showDivision: boolean;
  myTeamIds?: string[];
}) {
  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Standings appear here once pools are drawn and scores come in.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.poolId ?? "all"} className="space-y-2">
          <h4 className="font-display font-semibold">
            {g.poolName ?? "Standings"}
            {showDivision && g.divisionName && (
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                {g.divisionName}
              </span>
            )}
          </h4>
          <StandingsTable rows={g.rows} myTeamIds={myTeamIds} />
        </section>
      ))}
    </div>
  );
}
