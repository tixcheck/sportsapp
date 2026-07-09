import type { ScheduleMatch } from "@/lib/queries/leagues";

export type TeamActivity = "play" | "ref" | "off";

export interface TimelineRound {
  /** Unique per slot — a round can hold both a ref and a play duty. */
  key: string;
  /** The duty's round; null for an OFF rest (which sits between rounds). */
  round: number | null;
  activity: TeamActivity;
  /** The play or ref match this slot (null on an OFF rest). */
  match: ScheduleMatch | null;
  /** Start time of an OFF rest slot (ISO); duties carry their time on `match`. */
  at?: string;
}

/** Order matches by start time; unscheduled sort last. */
function byStart(a: ScheduleMatch, b: ScheduleMatch): number {
  return (a.scheduledAt ?? "￿").localeCompare(b.scheduledAt ?? "￿");
}

/** Sorted distinct start times across all matches — the tournament's slot grid. */
function slotGrid(matches: ScheduleMatch[]): string[] {
  const set = new Set<string>();
  for (const m of matches) if (m.scheduledAt) set.add(m.scheduledAt);
  return [...set].sort((a, b) => a.localeCompare(b));
}

interface Duty {
  round: number;
  kind: "play" | "ref";
  match: ScheduleMatch;
}

/** A team's scheduled duties (play or ref) in a numbered round, time-ordered. */
function teamDuties(teamId: string, matches: ScheduleMatch[]): Duty[] {
  const duties: Duty[] = [];
  for (const m of matches) {
    const r = m.round ?? 0;
    if (r <= 0) continue;
    if (m.homeTeamId === teamId || m.awayTeamId === teamId) {
      duties.push({ round: r, kind: "play", match: m });
    } else if (m.refTeamId === teamId) {
      duties.push({ round: r, kind: "ref", match: m });
    }
  }
  return duties.sort((a, b) => byStart(a.match, b.match) || a.round - b.round);
}

/**
 * A team's day, slot by slot: Play (they have a game), Ref (they officiate), or
 * OFF (a rest slot) from their first duty to their last. A round can hold BOTH a
 * ref and a play — a team often refs one court then plays the next — so those
 * appear as two slots, ordered by time. Rest is detected against the real game
 * grid: any time slot where games are running but the team isn't scheduled, and
 * that falls between two of the team's duties, is an OFF break (e.g. sitting out
 * the 11:50 slot between an 11:30 game and a 12:10 game). Nothing is shown
 * before the first duty or after the last — those aren't rest.
 */
export function teamTimeline(
  teamId: string,
  matches: ScheduleMatch[],
): TimelineRound[] {
  const duties = teamDuties(teamId, matches);
  if (duties.length === 0) return [];

  const grid = slotGrid(matches);
  const dutyTimes = new Set(
    duties.map((d) => d.match.scheduledAt).filter(Boolean) as string[],
  );

  const out: TimelineRound[] = [];
  for (let i = 0; i < duties.length; i++) {
    const d = duties[i];
    out.push({
      key: d.match.id,
      round: d.round,
      activity: d.kind,
      match: d.match,
    });

    // Fill rest for each empty grid slot strictly between this duty and the next.
    const next = duties[i + 1];
    const from = d.match.scheduledAt;
    const to = next?.match.scheduledAt;
    if (!next || !from || !to) continue;
    for (const slot of grid) {
      if (slot > from && slot < to && !dutyTimes.has(slot)) {
        out.push({
          key: `off-${slot}`,
          round: null,
          activity: "off",
          match: null,
          at: slot,
        });
      }
    }
  }
  return out;
}

export interface TeamEntry {
  key: string;
  round: number | null;
  kind: TeamActivity;
  /** The match for a Play/Ref entry; null for an OFF rest. */
  match: ScheduleMatch | null;
  /** Start time of an OFF rest slot (ISO). */
  at?: string;
}

/**
 * A team's schedule as an ordered list of entries — Play, Ref, and OFF rest —
 * so the detail list matches the strip. Built from the timeline, then any duties
 * with no round (unscheduled) are appended so nothing is dropped.
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
    at: t.at,
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
 * Rounds a team sits out entirely — no play and no ref — within its active
 * window (between its first and last round with a duty). This is the coarse,
 * round-grouped notion of "off" used by the By-round view; the finer per-slot
 * rest above is what the team-detail views show.
 */
export function teamOffRounds(
  teamId: string,
  matches: ScheduleMatch[],
): number[] {
  const withDuty = new Set<number>();
  const allRounds = new Set<number>();
  for (const m of matches) {
    const r = m.round ?? 0;
    if (r <= 0) continue;
    allRounds.add(r);
    if (
      m.homeTeamId === teamId ||
      m.awayTeamId === teamId ||
      m.refTeamId === teamId
    ) {
      withDuty.add(r);
    }
  }
  if (withDuty.size === 0) return [];
  const active = [...withDuty].sort((a, b) => a - b);
  const first = active[0];
  const last = active[active.length - 1];
  return [...allRounds]
    .filter((r) => r >= first && r <= last && !withDuty.has(r))
    .sort((a, b) => a - b);
}
