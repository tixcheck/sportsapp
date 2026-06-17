/**
 * Manual pool placement (Slice B). Pure reducer over the organizer's drag/tap
 * moves — no DB, no React. A Placement is the teams currently in each pool plus
 * an "unassigned" bin; moving a team always removes it from wherever it was, so
 * a team can never be in two places. The UI seeds this from the snake-draft and
 * then lets the organizer tweak; on confirm the pools feed generatePoolsAction.
 */

export type TeamId = string;

export interface Placement {
  /** Teams in each pool, in order, index-aligned with the pools array. */
  pools: TeamId[][];
  /** Teams not yet assigned to any pool. */
  unassigned: TeamId[];
}

/** A move destination: a pool index, or the unassigned bin. */
export type MoveDest = number | "unassigned";

/** Seed a placement from drafted pools (e.g. snakeDraftIntoSizes), nothing unassigned. */
export function placementFromPools(pools: TeamId[][]): Placement {
  return { pools: pools.map((p) => [...p]), unassigned: [] };
}

/**
 * Move `teamId` to `dest`. The team is first removed from every pool and the
 * bin, then appended to the destination — so the result never duplicates it and
 * sizes always reflect reality. An out-of-range pool index is a no-op (returns
 * the original state) so a stray move can't drop a team into the void.
 */
export function movePlacement(
  state: Placement,
  teamId: TeamId,
  dest: MoveDest,
): Placement {
  if (typeof dest === "number" && (dest < 0 || dest >= state.pools.length)) {
    return state;
  }
  const pools = state.pools.map((p) => p.filter((id) => id !== teamId));
  const unassigned = state.unassigned.filter((id) => id !== teamId);

  if (dest === "unassigned") {
    unassigned.push(teamId);
  } else {
    pools[dest].push(teamId);
  }
  return { pools, unassigned };
}

/** Append a new empty pool. */
export function addPlacementPool(state: Placement): Placement {
  return {
    pools: [...state.pools.map((p) => [...p]), []],
    unassigned: [...state.unassigned],
  };
}

/** Remove a pool, sending its teams back to the unassigned bin (never lost). */
export function removePlacementPool(
  state: Placement,
  index: number,
): Placement {
  if (index < 0 || index >= state.pools.length) return state;
  const moved = state.pools[index];
  return {
    pools: state.pools.filter((_, i) => i !== index).map((p) => [...p]),
    unassigned: [...state.unassigned, ...moved],
  };
}
