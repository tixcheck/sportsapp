import { DateTime } from "luxon";

import type { ScheduleMatch } from "@/lib/queries/leagues";
import { cn } from "@/lib/utils";

export type TeamActivity = "play" | "ref" | "off";

export interface TimelineRound {
  round: number;
  activity: TeamActivity;
  /** The play or ref match this round (null on an OFF round). */
  match: ScheduleMatch | null;
}

/**
 * A team's per-round day: Play (they have a game), Ref (they officiate), or OFF
 * (resting) for each round from their first activity to their last. Trimmed to
 * that window so leading/trailing empties aren't shown — the OFFs that remain
 * are real breaks between duties. Rounds are the shared time slots (teams on
 * different courts share a round), so this reads left-to-right as their day.
 */
export function teamTimeline(
  teamId: string,
  matches: ScheduleMatch[],
): TimelineRound[] {
  const byRound = new Map<
    number,
    { play?: ScheduleMatch; ref?: ScheduleMatch }
  >();
  for (const m of matches) {
    const r = m.round ?? 0;
    if (r <= 0) continue;
    const e = byRound.get(r) ?? {};
    if (m.homeTeamId === teamId || m.awayTeamId === teamId) e.play = m;
    else if (m.refTeamId === teamId) e.ref = m;
    byRound.set(r, e);
  }
  const ordered = [...byRound.keys()].sort((a, b) => a - b);
  const active = ordered.filter(
    (r) => byRound.get(r)?.play || byRound.get(r)?.ref,
  );
  if (active.length === 0) return [];
  const first = active[0];
  const last = active[active.length - 1];
  return ordered
    .filter((r) => r >= first && r <= last)
    .map((r): TimelineRound => {
      const e = byRound.get(r);
      if (e?.play) return { round: r, activity: "play", match: e.play };
      if (e?.ref) return { round: r, activity: "ref", match: e.ref };
      return { round: r, activity: "off", match: null };
    });
}

export interface TeamEntry {
  key: string;
  round: number | null;
  kind: TeamActivity;
  /** The match for a Play/Ref entry; null for an OFF round. */
  match: ScheduleMatch | null;
}

/**
 * A team's schedule as an ordered list of entries — Play (their game), Ref
 * (a game they officiate), and OFF (a rest round) — so the detail list matches
 * the strip. Built from the trimmed timeline, then any play games with no round
 * (unscheduled) are appended so nothing a team plays is dropped.
 */
export function teamScheduleEntries(
  teamId: string,
  matches: ScheduleMatch[],
): TeamEntry[] {
  const timeline = teamTimeline(teamId, matches);
  const entries: TeamEntry[] = timeline.map((t) => ({
    key: t.match ? t.match.id : `off-${t.round}`,
    round: t.round,
    kind: t.activity,
    match: t.match,
  }));
  const covered = new Set(
    timeline.map((t) => t.match?.id).filter(Boolean) as string[],
  );
  for (const m of matches) {
    const plays = m.homeTeamId === teamId || m.awayTeamId === teamId;
    if (plays && !covered.has(m.id)) {
      entries.push({
        key: m.id,
        round: m.round ?? null,
        kind: "play",
        match: m,
      });
    }
  }
  return entries;
}

const ACTIVITY_STYLE: Record<TeamActivity, string> = {
  play: "border-primary bg-primary text-primary-foreground",
  ref: "border-amber-400 bg-amber-100 text-amber-800",
  off: "border-border bg-muted text-muted-foreground",
};
const ACTIVITY_LABEL: Record<TeamActivity, string> = {
  play: "Play",
  ref: "Ref",
  off: "Off",
};

/** The Play/Ref/OFF strip — one pill per round, with the round's start time. */
export function ActivityStrip({
  timeline,
  timezone,
  className,
}: {
  timeline: TimelineRound[];
  timezone: string;
  className?: string;
}) {
  if (timeline.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {timeline.map((t) => (
        <div
          key={t.round}
          className={cn(
            "flex min-w-[3.25rem] flex-col items-center rounded-md border px-2 py-1 text-center",
            ACTIVITY_STYLE[t.activity],
          )}
        >
          <span className="text-[0.6rem] font-medium uppercase opacity-75">
            R{t.round}
          </span>
          <span className="text-xs leading-tight font-semibold">
            {ACTIVITY_LABEL[t.activity]}
          </span>
          {t.match?.scheduledAt && (
            <span className="text-[0.6rem] tabular-nums opacity-80">
              {DateTime.fromISO(t.match.scheduledAt, {
                zone: timezone,
              }).toFormat("h:mm a")}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
