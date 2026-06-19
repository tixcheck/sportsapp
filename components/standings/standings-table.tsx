import type { StandingsGroup, StandingsRowView } from "@/lib/standings/compute";
import { cn } from "@/lib/utils";
import { MyTeamBadge } from "@/components/team/my-team-badge";

import { PositionPill } from "./position-pill";

function fmt(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : "∞";
}

type StatCol = {
  key: keyof StandingsRowView;
  label: string;
  hint: string;
  // Almanac emphasis (§6.1): wins bold ink, losses recede to muted ink.
  cell: string;
};

const STAT_COLS: StatCol[] = [
  { key: "mw", label: "MW", hint: "Matches won", cell: "font-bold text-ink" },
  { key: "ml", label: "ML", hint: "Matches lost", cell: "text-ink-3" },
  { key: "sw", label: "SW", hint: "Sets won", cell: "" },
  { key: "sl", label: "SL", hint: "Sets lost", cell: "text-ink-3" },
  { key: "pf", label: "PF", hint: "Points for", cell: "" },
  { key: "pa", label: "PA", hint: "Points against", cell: "" },
];

const TIE_COL: StatCol = {
  key: "mt",
  label: "T",
  hint: "Matches tied",
  cell: "",
};

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

  // Show the Tied column only for formats that can tie (2-set games); a
  // best-of-3 pool/league has no ties, so its table is unchanged.
  const cols = rows.some((r) => r.mt > 0)
    ? [STAT_COLS[0], TIE_COL, ...STAT_COLS.slice(1)]
    : STAT_COLS;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm tabular-nums">
        <thead>
          <tr className="text-ink-2 border-ink border-b-[1.5px] text-[0.66rem] tracking-[0.1em] uppercase">
            <th className="w-10 px-2 pb-2 text-center font-bold">#</th>
            <th className="px-3 pb-2 text-left font-bold">Team</th>
            {cols.map((c) => (
              <th
                key={c.key as string}
                title={c.hint}
                className="px-2 pb-2 text-center font-bold"
              >
                {c.label}
              </th>
            ))}
            <th
              title="Set ratio (SW / SL)"
              className="px-3 pb-2 text-right font-bold"
            >
              Ratio
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
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
                  // The leader's rank is the one claret note (§6.1).
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
                {r.withdrawn && (
                  <span className="bg-paper-sunken text-ink-2 ml-2 rounded-[4px] px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                    Withdrawn
                  </span>
                )}
                {myTeamIds.includes(r.teamId) && (
                  <MyTeamBadge className="ml-2" />
                )}
              </td>
              {cols.map((c) => (
                <td
                  key={c.key as string}
                  className={cn("px-2 text-center", c.cell)}
                >
                  {r[c.key] as number}
                </td>
              ))}
              <td className="text-ink px-3 text-right font-semibold">
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
