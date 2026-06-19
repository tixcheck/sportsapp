/**
 * Single-elimination bracket seeding (PRD §7). Pure: no DB access.
 * Bracket is sized to the next power of two; standard seeding pairs strong vs
 * weak (1v16, 8v9, 4v13, …) so every first-round pair of seeds sums to size+1;
 * when there are fewer teams than slots, the highest seeds receive byes.
 */

export type TeamId = string;

export interface BracketEntry {
  /** Seed (1 = top). null = a bye slot or a not-yet-decided slot. */
  seed: number | null;
  teamId: TeamId | null;
}

export interface BracketMatch {
  round: number;
  matchNumber: number;
  home: BracketEntry;
  away: BracketEntry;
  /** True when one side is a bye (the real team advances). */
  isBye: boolean;
}

export interface BracketResult {
  teamCount: number;
  size: number;
  /** rounds[0] is the first round; later rounds are TBD placeholders. */
  rounds: BracketMatch[][];
}

export function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Standard bracket seeding order: the seed occupying each slot, such that
 * pairing slot 2k with slot 2k+1 gives the canonical matchups (1v16, 8v9, …).
 */
export function seedOrder(size: number): number[] {
  let seeds = [1];
  while (seeds.length < size) {
    const rounds = seeds.length * 2;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s, rounds + 1 - s);
    }
    seeds = next;
  }
  return seeds;
}

export function generateBracket(seededTeamIds: TeamId[]): BracketResult {
  const teamCount = seededTeamIds.length;
  const size = nextPowerOfTwo(teamCount);
  if (size < 2) return { teamCount, size, rounds: [] };

  const order = seedOrder(size);
  const entryForSeed = (seed: number): BracketEntry => ({
    seed: seed <= teamCount ? seed : null,
    teamId: seed <= teamCount ? seededTeamIds[seed - 1] : null,
  });

  const round1: BracketMatch[] = [];
  for (let i = 0; i < size / 2; i++) {
    const home = entryForSeed(order[2 * i]);
    const away = entryForSeed(order[2 * i + 1]);
    round1.push({
      round: 1,
      matchNumber: i + 1,
      home,
      away,
      isBye: home.teamId === null || away.teamId === null,
    });
  }

  const rounds: BracketMatch[][] = [round1];
  let prevCount = size / 2;
  let roundNo = 2;
  while (prevCount > 1) {
    const count = prevCount / 2;
    const matches: BracketMatch[] = [];
    for (let i = 0; i < count; i++) {
      matches.push({
        round: roundNo,
        matchNumber: i + 1,
        home: { seed: null, teamId: null },
        away: { seed: null, teamId: null },
        isBye: false,
      });
    }
    rounds.push(matches);
    prevCount = count;
    roundNo += 1;
  }

  return { teamCount, size, rounds };
}

// --- persistence + advancement (Phase 8) -----------------------------------

export interface PersistBracketMatch {
  round: number;
  /** 1-based slot within the round (matches.bracket_position). */
  position: number;
  homeTeamId: TeamId | null;
  awayTeamId: TeamId | null;
}

/** A bracket tree. Null = single-elim (back-compat); the two-track formats tag. */
export type BracketTrack = "championship" | "consolation";

export interface TrackedBracketMatch extends PersistBracketMatch {
  track: BracketTrack | null;
}

/**
 * Split an overall-ranked seed order into Championship + Consolation lists for
 * the dual-bracket format. Top `championship` seeds play the Championship; the
 * next `consolation` play the Consolation. Sizes are clamped to the teams
 * available (so 8/7 over a 13-team field yields 8 + 5, not 8 + 7 with phantoms).
 */
export function splitSeeds(
  order: TeamId[],
  championship: number,
  consolation: number,
): { championship: TeamId[]; consolation: TeamId[] } {
  const champ = Math.max(0, Math.min(championship, order.length));
  const conso = Math.max(0, Math.min(consolation, order.length - champ));
  return {
    championship: order.slice(0, champ),
    consolation: order.slice(champ, champ + conso),
  };
}

/**
 * Flatten one or two bracket tracks into the matches to persist. Each track
 * reuses seededBracketMatches() verbatim (independent round/position numbering),
 * tagged with its track. Omitting `consolation` ⇒ a single bracket, left
 * untagged (track = null) so existing single-elim behaviour is unchanged.
 */
export function dualBracketMatches(payload: {
  championship: TeamId[];
  consolation?: TeamId[];
}): TrackedBracketMatch[] {
  const hasConso = (payload.consolation?.length ?? 0) > 0;
  const champTrack: BracketTrack | null = hasConso ? "championship" : null;

  const out: TrackedBracketMatch[] = seededBracketMatches(
    payload.championship,
  ).map((m) => ({ ...m, track: champTrack }));

  if (hasConso) {
    out.push(
      ...seededBracketMatches(payload.consolation!).map((m) => ({
        ...m,
        track: "consolation" as const,
      })),
    );
  }
  return out;
}

/**
 * The parent (next-round) match a winner advances into. Pairing (2k-1, 2k) feed
 * parent k; the odd slot takes the home side, the even slot the away side. The
 * final has no parent (its parent coordinates simply match no row).
 */
export function bracketParent(
  round: number,
  position: number,
): { round: number; position: number; slot: "home" | "away" } {
  return {
    round: round + 1,
    position: Math.ceil(position / 2),
    slot: position % 2 === 1 ? "home" : "away",
  };
}

/**
 * Flatten a seeded bracket into the matches to persist. Byes are resolved at
 * generation: a bye team is placed straight into its round-2 slot and the
 * round-1 "vs BYE" match is omitted (the top seed skips round 1). Round-1
 * positions keep their original numbering (gaps where byes were) so
 * bracketParent() math stays valid. Later rounds are persisted as placeholders,
 * pre-filled where a bye (or two adjacent byes) already determines a team.
 */
export function seededBracketMatches(
  seededTeamIds: TeamId[],
): PersistBracketMatch[] {
  const { rounds, size } = generateBracket(seededTeamIds);
  if (size < 2) return [];

  const slots = new Map<string, PersistBracketMatch>();
  for (let r = 1; r < rounds.length; r++) {
    for (const m of rounds[r]) {
      slots.set(`${m.round}:${m.matchNumber}`, {
        round: m.round,
        position: m.matchNumber,
        homeTeamId: null,
        awayTeamId: null,
      });
    }
  }

  const out: PersistBracketMatch[] = [];
  for (const m of rounds[0]) {
    if (m.isBye) {
      const present = m.home.teamId ?? m.away.teamId;
      if (!present) continue;
      const parent = bracketParent(m.round, m.matchNumber);
      const slot = slots.get(`${parent.round}:${parent.position}`);
      if (slot) {
        if (parent.slot === "home") slot.homeTeamId = present;
        else slot.awayTeamId = present;
      }
    } else {
      out.push({
        round: m.round,
        position: m.matchNumber,
        homeTeamId: m.home.teamId,
        awayTeamId: m.away.teamId,
      });
    }
  }
  for (const s of slots.values()) out.push(s);

  out.sort((a, b) => a.round - b.round || a.position - b.position);
  return out;
}
