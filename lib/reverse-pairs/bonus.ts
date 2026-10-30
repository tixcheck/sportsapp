/**
 * Bonus points an organizer can award a pair (0192), added to the pair's
 * points in every game they play.
 *
 * Offlimits Sports' Halloween night, 2026-10-30: +2 for one player in costume,
 * +2 for both, +2 for matching costumes, each ticked separately so they stack.
 * Stored on the event as [{label, points}]; each award copies the points in.
 */

export interface BonusItem {
  label: string;
  points: number;
}

export const BONUS_LIMITS = { items: 10, label: 60, points: 99 } as const;

/** Read the stored column defensively: anything malformed is dropped. */
export function parseBonusItems(raw: unknown): BonusItem[] {
  if (!Array.isArray(raw)) return [];
  const out: BonusItem[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const { label, points } = x as { label?: unknown; points?: unknown };
    if (typeof label !== "string" || typeof points !== "number") continue;
    const l = label.trim();
    if (!l || l.length > BONUS_LIMITS.label || seen.has(l)) continue;
    if (!Number.isInteger(points) || Math.abs(points) > BONUS_LIMITS.points)
      continue;
    seen.add(l);
    out.push({ label: l, points });
    if (out.length === BONUS_LIMITS.items) break;
  }
  return out;
}

/** "+2", "-1": how a bonus reads on a chip. */
export function signedPoints(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
