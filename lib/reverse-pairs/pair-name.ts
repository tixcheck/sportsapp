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
