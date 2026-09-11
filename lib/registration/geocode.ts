import type { AddressMetadata } from "./locality";

/**
 * Resolving a TYPED address to a town.
 *
 * When a player picks a Google suggestion we get structured components back and
 * the city is certain. When they type instead — "33 Pali Drive", "41 newlyn
 * cres", or in one real case just the postal code "L7A 3J8" — there is nothing
 * structured to read, and `addressLocality` correctly reports unknown rather
 * than guessing at the text.
 *
 * That was 8 of BVL's 22 captains, all of them with perfectly good Brampton
 * addresses. Nobody's address is missing; those eight simply never triggered a
 * lookup. So we do the lookup ourselves, server-side, once, at save time.
 *
 * The result is marked `source: "geocoded"` and NOT passed off as structured.
 * A town Google matched from a half-typed line is a strong inference, not the
 * player's own answer, and an organizer acting on "4 of 6 from Brampton"
 * deserves to know which of those they said themselves.
 */

/** A single Places `searchText` candidate, trimmed to what we ask for. */
export interface PlaceCandidate {
  formattedAddress?: string;
  addressComponents?: { longText?: string; types?: string[] }[];
}

/**
 * Is this answer worth a lookup?
 *
 * Only free text with no structured detail. An answer that already carries a
 * locality is the player's own selection and must never be second-guessed, and
 * blank is blank.
 */
export function shouldGeocode(
  value: string | null | undefined,
  metadata?: AddressMetadata | null,
): boolean {
  if (metadata?.locality?.trim()) return false;
  const text = (value ?? "").trim();
  // Two characters cannot be an address, and a one-word query burns a paid
  // lookup to return whatever is nearest the bias.
  return text.length >= 4;
}

/**
 * The town out of a Places candidate.
 *
 * `locality` is the town; `postal_town` covers places that have none — an
 * unincorporated area — rather than reporting a neighbourhood or a county as
 * somebody's city. Same order as the suggestion path, so both agree.
 */
export function localityFromCandidate(
  candidate: PlaceCandidate | null | undefined,
): AddressMetadata | null {
  if (!candidate) return null;
  const part = (type: string) =>
    candidate.addressComponents?.find((c) => c.types?.includes(type))
      ?.longText ?? null;

  const locality = part("locality") ?? part("postal_town");
  // No town means the lookup did not answer the only question being asked, so
  // it is not an improvement on unknown.
  if (!locality) return null;

  return {
    locality,
    region: part("administrative_area_level_1"),
    postalCode: part("postal_code"),
    source: "geocoded",
  };
}

/**
 * Pick the candidate to trust from a `searchText` response.
 *
 * Google ranks by relevance against the location bias, so the first usable
 * candidate is the intended one. But a typed line that matches several DIFFERENT
 * towns is genuinely ambiguous — "41 newlyn cres" could exist twice — and
 * guessing between them is exactly what this module refuses to do. So a split
 * decision reports nothing and the answer stays honestly unknown.
 */
export function resolveCandidates(
  candidates: PlaceCandidate[] | null | undefined,
): AddressMetadata | null {
  const resolved = (candidates ?? [])
    .map(localityFromCandidate)
    .filter((m): m is AddressMetadata => m !== null);
  if (resolved.length === 0) return null;

  const first = resolved[0];
  const towns = new Set(
    resolved.map((m) => (m.locality ?? "").trim().toLowerCase()),
  );
  return towns.size === 1 ? first : null;
}
