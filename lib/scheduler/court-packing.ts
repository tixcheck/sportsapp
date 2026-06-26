/**
 * Smart pool scheduling — slice 3, part 2: pack whole pools onto courts.
 *
 * Each pool plays sequentially on a single court (so its idle teams can ref).
 * That means a pool is an indivisible block of `length` consecutive slots; the
 * only makespan lever is WHICH court each pool gets and in WHAT order they stack
 * when pools outnumber courts. The current layout assigns court = poolIndex %
 * courts, which ignores pool sizes and can stack a big pool on top of another
 * while a court sits idle. This packs pools longest-first onto the least-loaded
 * court to level finish times.
 *
 * Pure + deterministic. Returns the better of {current layout, LPT packing},
 * tie-broken to the current layout — so makespan is never worse than today and
 * the homogeneous / courts≥pools cases reproduce the current schedule exactly.
 */

export interface PoolPlacement {
  /** 1-based court number. */
  court: number;
  /** 0-based starting time-slot (wave) on that court. */
  startSlot: number;
}

/** Total finish time: the latest slot any court reaches. */
export function makespanOf(
  placements: PoolPlacement[],
  poolLengths: number[],
): number {
  let max = 0;
  placements.forEach((p, i) => {
    max = Math.max(max, p.startSlot + poolLengths[i]);
  });
  return max;
}

/** Current behavior: court = i % courts, stacked in pool-index order. */
function roundRobinLayout(
  poolLengths: number[],
  courts: number,
): PoolPlacement[] {
  const load = new Array<number>(courts).fill(0);
  return poolLengths.map((len, i) => {
    const court = i % courts;
    const startSlot = load[court];
    load[court] += len;
    return { court: court + 1, startSlot };
  });
}

/**
 * Longest-processing-time packing: place the largest pools first, each on the
 * currently least-loaded court (ties → lowest court index). Classic makespan
 * heuristic for identical machines.
 */
function lptLayout(poolLengths: number[], courts: number): PoolPlacement[] {
  const load = new Array<number>(courts).fill(0);
  const placements = new Array<PoolPlacement>(poolLengths.length);

  // Largest first; ties keep original index order (stable, deterministic).
  const order = poolLengths
    .map((len, i) => ({ len, i }))
    .sort((a, b) => b.len - a.len || a.i - b.i);

  for (const { len, i } of order) {
    let court = 0;
    for (let c = 1; c < courts; c++) if (load[c] < load[court]) court = c;
    placements[i] = { court: court + 1, startSlot: load[court] };
    load[court] += len;
  }
  return placements;
}

/**
 * Assign each pool a (court, startSlot). Picks whichever of the current layout
 * and LPT packing finishes sooner; ties go to the current layout so existing
 * schedules/tests are preserved exactly when packing can't help (homogeneous
 * sizes, or courts ≥ pools).
 */
export function packPoolsOntoCourts(
  poolLengths: number[],
  courts: number,
): PoolPlacement[] {
  const courtCount = Math.max(1, courts);
  if (poolLengths.length === 0) return [];

  const current = roundRobinLayout(poolLengths, courtCount);
  const lpt = lptLayout(poolLengths, courtCount);

  // Strict improvement required to switch ⇒ ties stay on the current layout.
  return makespanOf(lpt, poolLengths) < makespanOf(current, poolLengths)
    ? lpt
    : current;
}
