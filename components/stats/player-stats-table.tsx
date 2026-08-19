"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";

import type { PlayerStatRow } from "@/lib/queries/player-stats";
import {
  formatPct,
  formatRatioPct,
  formatSigned,
  type PlayerStats,
} from "@/lib/stats/player-stats";
import { cn } from "@/lib/utils";

type Key =
  | "name"
  | "gamesPlayed"
  | "wins"
  | "forAgainstRatio"
  | "avgPointsFor"
  | "winPct"
  | "pointsPlayed"
  | "pointsPerGame"
  | "clutchWins"
  | "clutchLosses"
  | "netClutch"
  | "clutchRate";

type Column = {
  key: Key;
  label: string;
  /** The long form, on hover — the header has to stay narrow. */
  hint: string;
  render: (s: PlayerStats) => string;
  numeric: boolean;
};

const COLUMNS: Column[] = [
  {
    key: "gamesPlayed",
    label: "GP",
    hint: "Sets played — doubles as attendance",
    render: (s) => String(s.gamesPlayed),
    numeric: true,
  },
  {
    key: "wins",
    label: "W",
    hint: "Sets won",
    render: (s) => String(s.wins),
    numeric: true,
  },
  {
    key: "forAgainstRatio",
    label: "F/A",
    hint: "Points for ÷ points against",
    render: (s) => formatRatioPct(s.forAgainstRatio),
    numeric: true,
  },
  {
    key: "avgPointsFor",
    label: "Avg",
    hint: "Points you score in a typical set",
    render: (s) => s.avgPointsFor.toFixed(1),
    numeric: true,
  },
  {
    key: "winPct",
    label: "Win%",
    hint: "Sets won ÷ sets played",
    render: (s) => formatPct(s.winPct),
    numeric: true,
  },
  {
    key: "pointsPlayed",
    label: "Pts",
    hint: "Every point in your sets, both directions",
    render: (s) => String(s.pointsPlayed),
    numeric: true,
  },
  {
    key: "pointsPerGame",
    label: "P/G",
    hint: "Points played per set — how long your sets run",
    render: (s) => s.pointsPerGame.toFixed(1),
    numeric: true,
  },
  {
    key: "clutchWins",
    label: "CW",
    hint: "Sets won by 2 points or fewer",
    render: (s) => String(s.clutchWins),
    numeric: true,
  },
  {
    key: "clutchLosses",
    label: "CL",
    hint: "Sets lost by 2 points or fewer",
    render: (s) => String(s.clutchLosses),
    numeric: true,
  },
  {
    key: "netClutch",
    label: "Net",
    hint: "Clutch wins − clutch losses",
    render: (s) => formatSigned(s.netClutch),
    numeric: true,
  },
  {
    key: "clutchRate",
    label: "Clutch%",
    hint: "Share of your sets decided by 2 points or fewer",
    render: (s) => formatRatioPct(s.clutchRate),
    numeric: true,
  },
];

/**
 * Net clutch is the one column worth colouring: it's the reason the table
 * exists, and it reads as a verdict rather than a measurement. Everything else
 * stays plain — a table where every cell is tinted is a table you can't read.
 */
function netClutchTint(n: number): string {
  if (n >= 4) return "bg-emerald-100 text-emerald-900";
  if (n > 0) return "bg-emerald-50 text-emerald-800";
  if (n === 0) return "text-ink-2";
  if (n > -4) return "bg-rose-50 text-rose-800";
  return "bg-rose-100 text-rose-900";
}

export function PlayerStatsTable({
  rows,
  linkProfiles = false,
}: {
  rows: PlayerStatRow[];
  /**
   * Whether a name links to that player's profile. Off for the public page:
   * `/players/[id]` reads the user row, which RLS hides from anyone who
   * doesn't share context — so a visitor clicking through would get a 404.
   */
  linkProfiles?: boolean;
}) {
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({
    key: "netClutch",
    desc: true,
  });

  const sorted = useMemo(() => {
    const dir = sort.desc ? -1 : 1;
    return [...rows].sort((a, b) => {
      if (sort.key === "name") return dir * a.name.localeCompare(b.name);
      const av = a.stats[sort.key];
      const bv = b.stats[sort.key];
      // An undefined ratio (nothing conceded) is the best possible value, so it
      // must sort to the top, not wherever Infinity happens to land.
      const norm = (v: number) => (Number.isFinite(v) ? v : Number.MAX_VALUE);
      return dir * (norm(av) - norm(bv)) || a.name.localeCompare(b.name);
    });
  }, [rows, sort]);

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        Player stats appear once scores are recorded.
      </p>
    );
  }

  function toggle(key: Key) {
    setSort((prev) =>
      prev.key === key
        ? { key, desc: !prev.desc }
        : { key, desc: key !== "name" },
    );
  }

  const arrow = (key: Key) =>
    sort.key === key ? (
      sort.desc ? (
        <ArrowDown className="inline size-3" />
      ) : (
        <ArrowUp className="inline size-3" />
      )
    ) : null;

  return (
    <div className="space-y-2">
      {/* Twelve columns never fit a phone, so the table scrolls inside its own
          box rather than pushing the page sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm tabular-nums">
          <thead>
            <tr className="text-ink-2 border-ink border-b-[1.5px] text-[0.66rem] tracking-[0.1em] uppercase">
              <th className="px-3 pb-2 text-left font-bold">
                <button type="button" onClick={() => toggle("name")}>
                  Player {arrow("name")}
                </button>
              </th>
              <th className="px-3 pb-2 text-left font-bold">Team</th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  title={c.hint}
                  className="px-2 pb-2 text-center font-bold"
                >
                  <button type="button" onClick={() => toggle(c.key)}>
                    {c.label} {arrow(c.key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={`${r.teamId}:${r.userId ?? r.name}`}
                className="border-rule h-11 border-b last:border-0"
              >
                <td className="px-3 font-semibold whitespace-nowrap">
                  {linkProfiles && r.userId ? (
                    <Link
                      href={`/players/${r.userId}`}
                      className="hover:text-primary underline-offset-2 hover:underline"
                    >
                      {r.name}
                    </Link>
                  ) : (
                    <span>{r.name}</span>
                  )}
                  {r.pending && (
                    <span
                      title="This player hasn't claimed their invite, so there's no profile behind the name yet."
                      className="bg-paper-sunken text-ink-3 ml-2 rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
                    >
                      Unclaimed
                    </span>
                  )}
                </td>
                <td className="text-ink-2 px-3 whitespace-nowrap">
                  {r.teamName}
                </td>
                {COLUMNS.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-2 text-center",
                      c.key === "netClutch" &&
                        cn("font-semibold", netClutchTint(r.stats.netClutch)),
                    )}
                  >
                    {c.render(r.stats)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-ink-3 text-[0.7rem]">
        GP sets played · W won · F/A points for ÷ against · Avg points per set ·
        Pts every point both ways · P/G points per set · CW/CL sets won/lost by
        2 or fewer · Net CW − CL
      </p>
    </div>
  );
}
