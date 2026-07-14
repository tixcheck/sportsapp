import { DateTime } from "luxon";

import type { MatchFormat } from "@/lib/db/schema";
import type { StandingsGroup, StandingsRowView } from "@/lib/standings/compute";
import { standingsLegendFlags } from "@/lib/formats";
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

/** Signed differential, e.g. +5 / -3 / 0. */
function fmtDiff(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function StandingsTable({
  rows,
  myTeamIds = [],
  format,
  differential = false,
}: {
  rows: StandingsRowView[];
  myTeamIds?: string[];
  /** When known, the match format drives which columns show (authoritative). */
  format?: MatchFormat;
  /** Point-differential tiebreaker: rank by PF − PA, not the OVA set/point
   * ratios — so the columns/legend match the organizer's chosen setting. */
  differential?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        No results yet — standings appear once scores are confirmed.
      </p>
    );
  }

  // Single-set play (one set per game): a team's sets won/lost always equal its
  // matches won/lost, so the SW/SL columns are redundant — hide them (the game
  // count lives in GP, and the meaningful tiebreaker is the point ratio). Prefer
  // the format when known; otherwise infer from the data (per-pool for a mixed
  // competition).
  const played = rows.filter((r) => r.mw + r.ml + r.mt > 0);
  const singleSet = format
    ? standingsLegendFlags(format).singleSet
    : played.length > 0 &&
      played.every((r) => r.sw === r.mw && r.sl === r.ml && r.mt === 0);
  // Point-differential ranking doesn't use set ratio, so drop SW/SL there too —
  // the table should only show what actually decides the order.
  const dropSets = singleSet || differential;
  const base = dropSets
    ? STAT_COLS.filter((c) => c.key !== "sw" && c.key !== "sl")
    : STAT_COLS;

  // Show the Tied column only for formats that can tie (2-set games); a
  // best-of-3 pool/league has no ties, so its table is unchanged.
  const cols = rows.some((r) => r.mt > 0)
    ? [base[0], TIE_COL, ...base.slice(1)]
    : base;

  // Week-over-week: the ordered league nights any team played (leagues attach
  // per-night W/L; tournaments don't, so these columns simply don't appear).
  const weekDates = [
    ...new Set(rows.flatMap((r) => r.weekly.map((w) => w.date))),
  ].sort();
  const weekLabel = (d: string) => DateTime.fromISO(d).toFormat("LLL d");

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm tabular-nums">
        <thead>
          <tr className="text-ink-2 border-ink border-b-[1.5px] text-[0.66rem] tracking-[0.1em] uppercase">
            <th className="w-10 px-2 pb-2 text-center font-bold">#</th>
            <th className="px-3 pb-2 text-left font-bold">Team</th>
            <th
              title="Games played / scheduled"
              className="px-2 pb-2 text-center font-bold"
            >
              GP
            </th>
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
              title={
                differential
                  ? "Point differential (PF − PA)"
                  : "Point ratio (PF / PA)"
              }
              className="px-3 pb-2 text-right font-bold"
            >
              {differential ? "Diff" : "Ratio"}
            </th>
            {weekDates.map((d) => (
              <th
                key={d}
                title="Won / lost that night"
                className="px-2 pb-2 text-center font-bold whitespace-nowrap"
              >
                {weekLabel(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const byDate = new Map(r.weekly.map((w) => [w.date, w]));
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
                <td className="text-ink-2 px-2 text-center">
                  {r.mw + r.ml + r.mt}
                  <span className="text-ink-3">/{r.gamesScheduled}</span>
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
                  {differential ? fmtDiff(r.pf - r.pa) : fmt(r.pointRatio)}
                </td>
                {weekDates.map((d) => {
                  const w = byDate.get(d);
                  return (
                    <td
                      key={d}
                      className="px-2 text-center whitespace-nowrap tabular-nums"
                    >
                      {w ? (
                        <>
                          <span className="text-ink font-semibold">
                            {w.won}
                          </span>
                          <span className="text-ink-3">/{w.lost}</span>
                        </>
                      ) : (
                        <span className="text-ink-3">–</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The ranking-rules note + column legend. Mirrors the OVA hierarchy in
 * lib/scheduler/tiebreakers.ts — keep the order here in sync with it.
 */
export function StandingsLegend({
  className,
  singleSet = false,
  canTie = true,
  format,
  differential = false,
}: {
  className?: string;
  /** One set per game: drop the set-ratio step and the SW/SL legend. */
  singleSet?: boolean;
  /** Whether a game can end in a tie (fixed 2-set play). Best-of-N can't. */
  canTie?: boolean;
  /** When known, the format is authoritative over the two flags above. */
  format?: MatchFormat;
  /** Point-differential tiebreaker: final step is PF − PA, no set-ratio step. */
  differential?: boolean;
}) {
  const flags = format ? standingsLegendFlags(format) : { singleSet, canTie };
  const single = flags.singleSet;
  const ties = !single && flags.canTie;
  const unit = single ? "games" : "matches";
  // In differential mode set ratio is not a tiebreaker — hide the SW/SL step.
  const showSets = !single && !differential;
  return (
    <div className={cn("text-ink-2 space-y-1 text-[0.7rem]", className)}>
      <p>
        <span className="font-semibold">How rankings are calculated:</span> by{" "}
        {unit} won{ties ? " (a tied 2-set game counts as ½ a win)" : ""}, then
        head-to-head among tied teams,
        {differential
          ? " then point differential (PF − PA)."
          : `${showSets ? " then set ratio (SW / SL)," : ""} then point ratio (PF / PA).`}
      </p>
      <p className="text-ink-3">
        GP games played / scheduled · MW/ML {unit} won/lost ·
        {ties ? " T tied ·" : ""}
        {showSets ? " SW/SL sets ·" : ""} PF/PA points ·{" "}
        {differential ? "Diff = PF − PA" : "Ratio = PF / PA"}
      </p>
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
  format,
}: {
  groups: StandingsGroup[];
  showDivision: boolean;
  myTeamIds?: string[];
  /** Pool-play format — makes the legend/columns accurate to the format. */
  format?: MatchFormat;
}) {
  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Standings appear here once pools are drawn and scores come in.
      </p>
    );
  }
  const played = groups.flatMap((g) =>
    g.rows.filter((r) => r.mw + r.ml + r.mt > 0),
  );
  const singleSet = format
    ? standingsLegendFlags(format).singleSet
    : played.length > 0 &&
      played.every((r) => r.sw === r.mw && r.sl === r.ml && r.mt === 0);
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
          <StandingsTable rows={g.rows} myTeamIds={myTeamIds} format={format} />
        </section>
      ))}
      <StandingsLegend singleSet={singleSet} format={format} />
    </div>
  );
}
