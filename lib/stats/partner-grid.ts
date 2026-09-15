/**
 * Who has played with whom, shaped for a page.
 *
 * A drafted league re-shuffles its teams every session precisely so people get
 * to play with everyone. `partnershipCounts` already counts shared NIGHTS per
 * pair — three games together on a Friday is one occasion, not three — and this
 * turns that into what an organizer reads: a grid, the pairs that have never
 * happened, and the ones that keep repeating.
 *
 * Plain arrays and objects only, never Maps: the result is built on the server
 * and handed to a page, and a Map does not survive that trip.
 *
 * Pure: no DB.
 */

export interface GridPlayer {
  /** `identityKey` — `u:<userId>` for an account, `n:<name>` for a guest. */
  key: string;
  name: string;
}

export interface PartnerGrid {
  /** Row and column order, alphabetical. */
  players: GridPlayer[];
  /** `counts[i][j]` = nights players i and j were on the same team. */
  counts: number[][];
  neverTogether: { a: GridPlayer; b: GridPlayer }[];
  /** Pairs who have shared a team on two or more nights, most first. */
  repeats: { a: GridPlayer; b: GridPlayer; nights: number }[];
  max: number;
}

/**
 * The key `partnershipCounts` files a pair under: the two identities in string
 * order, joined. Stated once here so a lookup can never use the other order.
 */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function buildPartnerGrid(
  players: GridPlayer[],
  counts: Map<string, number>,
): PartnerGrid {
  const unique = new Map<string, GridPlayer>();
  for (const p of players) if (!unique.has(p.key)) unique.set(p.key, p);
  const ordered = [...unique.values()].sort(
    (x, y) => x.name.localeCompare(y.name) || x.key.localeCompare(y.key),
  );

  const grid = ordered.map((row) =>
    ordered.map((col) =>
      row.key === col.key ? 0 : (counts.get(pairKey(row.key, col.key)) ?? 0),
    ),
  );

  const neverTogether: PartnerGrid["neverTogether"] = [];
  const repeats: PartnerGrid["repeats"] = [];
  let max = 0;
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const n = grid[i][j];
      max = Math.max(max, n);
      if (n === 0) neverTogether.push({ a: ordered[i], b: ordered[j] });
      if (n >= 2) repeats.push({ a: ordered[i], b: ordered[j], nights: n });
    }
  }
  repeats.sort(
    (x, y) =>
      y.nights - x.nights ||
      x.a.name.localeCompare(y.a.name) ||
      x.b.name.localeCompare(y.b.name),
  );

  return { players: ordered, counts: grid, neverTogether, repeats, max };
}

/**
 * For each player in the draft pool, who in the pool they have never played
 * with — the list an organizer wants open while dealing out new teams.
 *
 * Only players who have played at least one night are compared. Somebody new
 * has "never played with" the whole pool, which is true and useless, so they
 * are returned separately as newcomers instead of flooding every line.
 */
export function neverTogetherForPool(
  grid: PartnerGrid,
  pool: GridPlayer[],
): {
  entries: { player: GridPlayer; never: GridPlayer[] }[];
  newcomers: GridPlayer[];
} {
  const index = new Map(grid.players.map((p, i) => [p.key, i]));
  const seen = new Set<string>();
  const played: GridPlayer[] = [];
  const newcomers: GridPlayer[] = [];
  for (const p of pool) {
    if (seen.has(p.key)) continue;
    seen.add(p.key);
    if (index.has(p.key)) played.push(p);
    else newcomers.push(p);
  }

  const entries = played
    .map((player) => {
      const i = index.get(player.key)!;
      const never = played.filter(
        (other) =>
          other.key !== player.key &&
          grid.counts[i][index.get(other.key)!] === 0,
      );
      return { player, never };
    })
    .filter((e) => e.never.length > 0)
    .sort(
      (x, y) =>
        y.never.length - x.never.length ||
        x.player.name.localeCompare(y.player.name),
    );

  newcomers.sort((x, y) => x.name.localeCompare(y.name));
  return { entries, newcomers };
}
