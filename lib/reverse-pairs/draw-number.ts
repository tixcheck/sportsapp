/**
 * Reverse Pairs numbers drawn at the door (0187).
 *
 * The schedule is drawn against numbers, and pairs pick theirs on arrival. Until
 * a pair's number is entered, its place in the schedule belongs to nobody yet,
 * so the schedule and standings show "Pair 7" rather than the name of whichever
 * pair happens to hold slot 7 — that would tell people the wrong games.
 */

export interface DrawNumbered {
  name: string;
  drawNumber: number | null;
  drawNumberSet: boolean;
}

/**
 * The team name when the pair has one. Organizers write "Space Jam - Sydney P.
 * & Raj K." (Offlimits, 2026-10-30): team, then players. On a phone the whole
 * thing makes the schedule and standings scroll sideways, so they show "Space
 * Jam"; a pair with no team name ("Kaidi L. & Chris N.") shows as written.
 * Only a spaced " - " splits, so "Nina E-G" stays whole.
 */
export function shortPairName(name: string): string {
  const i = name.indexOf(" - ");
  if (i <= 0) return name;
  const team = name.slice(0, i).trim();
  return team || name;
}

/** What the schedule and standings call a pair. */
export function displayPairName(p: DrawNumbered): string {
  const name = shortPairName(p.name);
  if (p.drawNumber === null) return name;
  return p.drawNumberSet ? `${p.drawNumber} · ${name}` : `Pair ${p.drawNumber}`;
}

/** Numbers nobody has been given yet, in order. */
export function numbersLeft(pairs: DrawNumbered[]): number[] {
  return pairs
    .filter((p) => p.drawNumber !== null && !p.drawNumberSet)
    .map((p) => p.drawNumber!)
    .sort((a, b) => a - b);
}

/**
 * The typed box, as a number to save: null to clear, or an error to show.
 * The database re-checks the range; this keeps a typo from a round trip.
 */
export function parseDrawNumber(
  text: string,
  max: number,
): { number: number | null } | { error: string } {
  const t = text.trim();
  if (t === "") return { number: null };
  if (!/^\d+$/.test(t)) return { error: "Numbers only." };
  const n = Number(t);
  if (n < 1 || n > max) return { error: `Pick a number from 1 to ${max}.` };
  return { number: n };
}
