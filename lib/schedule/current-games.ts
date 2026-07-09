import type { ScheduleMatch } from "@/lib/queries/leagues";

/** Statuses that mean a game is done — it can't be the "current" game. */
const FINAL = new Set(["completed", "forfeit", "cancelled"]);

function byStart(a: ScheduleMatch, b: ScheduleMatch): number {
  return (
    (a.scheduledAt ?? "￿").localeCompare(b.scheduledAt ?? "￿") ||
    (a.round ?? 0) - (b.round ?? 0)
  );
}

/** Trailing court number for stable ordering ("Court 2" < "Court 10"). */
function courtRank(court: string): number {
  const m = court.match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
}

export interface CourtGame {
  court: string;
  match: ScheduleMatch;
}

/**
 * The game currently being played on each court, derived from score entry: the
 * earliest game on the court that isn't Final yet (an explicitly Live game wins
 * if present). Only courts where play has started are included — a court shows
 * nothing until one of its games is Live or Final, so "now playing" appears the
 * moment the last score is entered and advances to the next game from there.
 */
export function currentGames(matches: ScheduleMatch[]): CourtGame[] {
  const byCourt = new Map<string, ScheduleMatch[]>();
  for (const m of matches) {
    if (!m.court || !m.homeTeamId || !m.awayTeamId) continue; // real, courted game
    let arr = byCourt.get(m.court);
    if (!arr) {
      arr = [];
      byCourt.set(m.court, arr);
    }
    arr.push(m);
  }

  const out: CourtGame[] = [];
  for (const [court, games] of byCourt) {
    const sorted = [...games].sort(byStart);
    const started = sorted.some(
      (g) => g.status === "in_progress" || FINAL.has(g.status),
    );
    if (!started) continue; // no score entered on this court yet
    const live = sorted.find((g) => g.status === "in_progress");
    const current = live ?? sorted.find((g) => !FINAL.has(g.status));
    if (current) out.push({ court, match: current });
  }
  return out.sort((a, b) => courtRank(a.court) - courtRank(b.court));
}
