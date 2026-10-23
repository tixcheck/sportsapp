/**
 * A Reverse Pairs pair's generated name: `Captain/Partner`, or `Captain/TBD`
 * before there is a partner.
 *
 * The database owns the real name (`reverse_pair_base_name`, 0145) and keeps it
 * in step as a partner is invited or joins. This mirror exists so the sign-up
 * form can show a player what they'll be called before they press Register,
 * and so the rule is pinned by tests. Keep the two in step.
 */

export const PARTNER_PLACEHOLDER = "TBD";

/** The first word of a name; null when there isn't one. */
export function firstNameOf(full: string | null | undefined): string | null {
  const first = (full ?? "").trim().split(/\s+/)[0];
  return first ? first : null;
}

export function pairName(
  captain: { displayName?: string | null; email?: string | null },
  partnerName?: string | null,
): string {
  const me =
    firstNameOf(captain.displayName) ??
    firstNameOf(captain.email?.split("@")[0]) ??
    "Player";
  return `${me}/${firstNameOf(partnerName) ?? PARTNER_PLACEHOLDER}`;
}

/**
 * The draw-at-the-door label in a pair's name: "J" from "Pair J" or from
 * "J · Sarah & Dylan". Null for an ordinary name.
 */
export function doorLabelOf(name: string): string | null {
  const m =
    /^Pair (\S{1,3})$/.exec(name.trim()) ?? /^(\S{1,3}) · /.exec(name.trim());
  return m ? m[1] : null;
}

/**
 * The name to store when an organizer renames a pair. A pair set up as a
 * placeholder ("Pair J") keeps its letter in front — "J · Sarah & Dylan" — so
 * the printed sheet, which only knows "J", still matches the app.
 */
export function renamedPairName(current: string, typed: string): string {
  const name = typed.trim();
  const label = doorLabelOf(current);
  if (!label || name === "" || doorLabelOf(name) === label) return name;
  return `${label} · ${name}`;
}
