import type { ScheduleMatch } from "@/lib/queries/leagues";

export type TeamActivity = "play" | "ref" | "off";

export interface TimelineRound {
  /** Unique per slot — a round can hold both a ref and a play duty. */
  key: string;
  round: number;
  activity: TeamActivity;
  /** The play or ref match this slot (null on an OFF round). */
  match: ScheduleMatch | null;
}

/** Order matches within a round by start time; unscheduled sort last. */
function byStart(a: ScheduleMatch, b: ScheduleMatch): number {
  return (a.scheduledAt ?? "￿").localeCompare(b.scheduledAt ?? "￿");
}

/**
 * A team's day, slot by slot: Play (they have a game), Ref (they officiate), or
 * OFF (resting), from their first duty to their last. A round can hold BOTH a
 * ref and a play — a team often refs one court then plays the next in the same
 * round — so those appear as two slots, ordered by start time. Trimmed to the
 * active window so leading/trailing empties aren't shown; the OFFs that remain
 * are real breaks. Rounds are shared time slots, so this reads as their day.
 */
export function teamTimeline(
  teamId: string,
  matches: ScheduleMatch[],
): TimelineRound[] {
  const byRound = new Map<
    number,
    { play: ScheduleMatch[]; ref: ScheduleMatch[] }
  >();
  for (const m of matches) {
    const r = m.round ?? 0;
    if (r <= 0) continue;
    const e = byRound.get(r) ?? { play: [], ref: [] };
    if (m.homeTeamId === teamId || m.awayTeamId === teamId) e.play.push(m);
    else if (m.refTeamId === teamId) e.ref.push(m);
    byRound.set(r, e);
  }
  const ordered = [...byRound.keys()].sort((a, b) => a - b);
  const active = ordered.filter((r) => {
    const e = byRound.get(r)!;
    return e.play.length > 0 || e.ref.length > 0;
  });
  if (active.length === 0) return [];
  const first = active[0];
  const last = active[active.length - 1];

  const out: TimelineRound[] = [];
  for (const r of ordered) {
    if (r < first || r > last) continue;
    const e = byRound.get(r)!;
    const duties = [
      ...e.ref.map((m) => ({ m, kind: "ref" as const })),
      ...e.play.map((m) => ({ m, kind: "play" as const })),
    ].sort((a, b) => byStart(a.m, b.m));
    if (duties.length === 0) {
      out.push({ key: `off-${r}`, round: r, activity: "off", match: null });
    } else {
      for (const d of duties) {
        out.push({ key: d.m.id, round: r, activity: d.kind, match: d.m });
      }
    }
  }
  return out;
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
 * the strip. Built from the trimmed timeline, then any duties with no round
 * (unscheduled) are appended so nothing a team plays or refs is dropped.
 */
export function teamScheduleEntries(
  teamId: string,
  matches: ScheduleMatch[],
): TeamEntry[] {
  const timeline = teamTimeline(teamId, matches);
  const entries: TeamEntry[] = timeline.map((t) => ({
    key: t.key,
    round: t.round,
    kind: t.activity,
    match: t.match,
  }));
  const covered = new Set(
    timeline.map((t) => t.match?.id).filter(Boolean) as string[],
  );
  for (const m of matches) {
    if ((m.round ?? 0) > 0) continue; // scheduled duties already in the timeline
    const plays = m.homeTeamId === teamId || m.awayTeamId === teamId;
    const refs = m.refTeamId === teamId;
    if ((plays || refs) && !covered.has(m.id)) {
      entries.push({
        key: m.id,
        round: m.round ?? null,
        kind: plays ? "play" : "ref",
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
