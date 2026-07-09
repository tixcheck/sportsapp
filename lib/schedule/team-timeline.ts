import type { ScheduleMatch } from "@/lib/queries/leagues";

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

/**
 * The rounds a team sits out — neither playing nor reffing — within its active
 * window (between its first and last duty). These are the real breaks; leading
 * and trailing empties are excluded by the timeline's trimming.
 */
export function teamOffRounds(
  teamId: string,
  matches: ScheduleMatch[],
): number[] {
  return teamTimeline(teamId, matches)
    .filter((t) => t.activity === "off")
    .map((t) => t.round);
}
