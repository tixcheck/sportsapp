/**
 * What a restore point stores, and how it comes back. Pure: no DB access.
 *
 * The awkward part of restoring is not the matches, it is the TEAMS. A snapshot
 * holds team ids, and by the time someone restores, a team may have been
 * renamed, dropped, or replaced by a re-added one with a new id. Silently
 * dropping those games would restore a schedule with holes in it and nobody
 * would notice until a player asked why their match vanished.
 *
 * So a snapshot carries both the id and the name, and `resolveTeams` matches by
 * id first, then by name, and reports anything it cannot place instead of
 * guessing. The caller decides whether to proceed.
 */

export interface SnapshotSet {
  n: number;
  h: number | null;
  a: number | null;
}

export interface SnapshotMatch {
  round: number | null;
  court: string | null;
  scheduledAt: string | null;
  status: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** Copied in so a renamed or re-added team can still be matched. */
  homeTeamName: string | null;
  awayTeamName: string | null;
  refTeamId: string | null;
  refTeamName: string | null;
  poolId: string | null;
  bracketPosition: number | null;
  bracketTrack: string | null;
  isAbnormal: boolean;
  matchFormat: unknown;
  venueId: string | null;
  sets: SnapshotSet[];
}

export interface SnapshotPayload {
  version: 1;
  takenAt: string;
  matches: SnapshotMatch[];
}

/** A team as it exists right now, for resolving a snapshot against. */
export interface LiveTeam {
  id: string;
  name: string;
}

export interface ResolveResult {
  /** snapshot team id -> live team id. */
  mapping: Map<string, string>;
  /** Names in the snapshot with no live team, so the caller can refuse. */
  missing: { id: string; name: string | null }[];
  /** Resolved by name because the id was gone — worth telling the organizer. */
  rematchedByName: { name: string; fromId: string; toId: string }[];
}

/**
 * Map the snapshot's team ids onto the teams that exist now.
 *
 * Name matching is case- and whitespace-insensitive but otherwise exact. It is
 * deliberately not fuzzy: quietly restoring "Block Party" onto "Block Party B"
 * would corrupt a season more subtly than losing it.
 */
export function resolveTeams(
  payload: SnapshotPayload,
  liveTeams: LiveTeam[],
): ResolveResult {
  const byId = new Map(liveTeams.map((t) => [t.id, t]));
  const byName = new Map<string, LiveTeam>();
  for (const t of liveTeams) {
    const key = normalize(t.name);
    // First writer wins: with duplicate names there is no right answer, so
    // don't silently pick the later one.
    if (!byName.has(key)) byName.set(key, t);
  }

  const mapping = new Map<string, string>();
  const missing: ResolveResult["missing"] = [];
  const rematchedByName: ResolveResult["rematchedByName"] = [];
  const seen = new Set<string>();

  for (const m of payload.matches) {
    for (const side of [
      { id: m.homeTeamId, name: m.homeTeamName },
      { id: m.awayTeamId, name: m.awayTeamName },
      { id: m.refTeamId, name: m.refTeamName },
    ]) {
      if (!side.id || seen.has(side.id)) continue;
      seen.add(side.id);

      if (byId.has(side.id)) {
        mapping.set(side.id, side.id);
        continue;
      }
      const byNameHit = side.name
        ? byName.get(normalize(side.name))
        : undefined;
      if (byNameHit) {
        mapping.set(side.id, byNameHit.id);
        rematchedByName.push({
          name: side.name!,
          fromId: side.id,
          toId: byNameHit.id,
        });
        continue;
      }
      missing.push({ id: side.id, name: side.name });
    }
  }

  return { mapping, missing, rematchedByName };
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** How many matches in a payload carry a recorded result. */
export function countResults(payload: SnapshotPayload): number {
  return payload.matches.filter(
    (m) => m.sets.length > 0 || m.status !== "scheduled",
  ).length;
}

/**
 * Which restore points to drop once a new one is written.
 *
 * Keeps the newest `keep` for the scope. Returns ids to delete, so the caller
 * does one delete rather than the caller reimplementing the rule.
 */
export function idsToPrune(
  existing: { id: string; createdAt: string }[],
  keep: number,
): string[] {
  return [...existing]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(keep)
    .map((r) => r.id);
}
