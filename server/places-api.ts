import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  resolveCandidates,
  shouldGeocode,
  type PlaceCandidate,
} from "@/lib/registration/geocode";
import type { AddressMetadata } from "@/lib/registration/locality";
import { takeRateLimit } from "@/server/rate-limit";

/*
 * Google Places plumbing shared by the lookup actions (server/actions/places.ts)
 * and server-side geocoding. Kept OUT of the "use server" file: everything
 * exported from there is a public endpoint, and `geocodeTypedAddress` used to
 * be one, spending the Places key for anyone (security audit, 2026-10-30).
 */

/**
 * Where venue search is biased, and which countries it searches.
 *
 * A bias is necessary — unbiased, "Community Centre" returns same-named gyms on
 * other continents. But WHICH place it leans toward is deployment config, not a
 * fact about the product: an organizer outside the default region would
 * otherwise get a venue field that quietly can't find their gym. The defaults
 * are the current leagues' region, so nothing changes for them.
 */
function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const BIAS = {
  latitude: num(process.env.PLACES_BIAS_LAT, 43.6532),
  longitude: num(process.env.PLACES_BIAS_LNG, -79.3832),
};

export const REGION_CODES = (process.env.PLACES_REGION_CODES ?? "ca")
  .split(",")
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean);

export function placesKey(): string | null {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
}

/**
 * Whether a browser-triggered lookup may run: signed in, and under the daily
 * allowance (300 a user). Every lookup is billed to us by Google, and before
 * this anyone on the internet could call them.
 */
export async function placesLookupAllowed(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  return takeRateLimit(supabase, "places");
}

/**
 * Resolve a TYPED address to a town, server-side.
 *
 * The suggestion path (`resolveAddressAction`) only fires when a player taps a
 * dropdown entry. Eight of BVL's twenty-two captains typed their address
 * instead and came back "not known" — with perfectly good Brampton addresses.
 * This closes that gap by doing the lookup they never triggered.
 *
 * Uses Places `searchText` rather than the Geocoding API deliberately: it is
 * the same API already enabled on this key, so nothing new has to be turned on
 * in Google Cloud. Biased the same way as the autocomplete, so a half-typed
 * street resolves near the league rather than to the same name in another
 * country.
 *
 * Returns null rather than a guess whenever the answer is genuinely ambiguous —
 * see `resolveCandidates`.
 */
export async function geocodeTypedAddress(
  value: string,
  metadata?: AddressMetadata | null,
): Promise<AddressMetadata | null> {
  if (!shouldGeocode(value, metadata)) return null;

  const key = placesKey();
  if (!key) return null;

  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          // Components only. The mask sets the billing tier, and anything beyond
          // the address parts would be paid for and thrown away.
          "X-Goog-FieldMask":
            "places.addressComponents,places.formattedAddress",
        },
        body: JSON.stringify({
          textQuery: value.trim(),
          // Two is enough to notice disagreement without paying for a page of it.
          maxResultCount: 2,
          regionCode: REGION_CODES[0]?.toUpperCase() ?? "CA",
          locationBias: {
            circle: { center: BIAS, radius: 50000 },
          },
        }),
        signal: AbortSignal.timeout(4000),
      },
    );

    if (!res.ok) {
      console.error("[places] geocode failed", res.status);
      return null;
    }

    const body = (await res.json()) as { places?: PlaceCandidate[] };
    return resolveCandidates(body.places);
  } catch {
    console.error("[places] geocode threw");
    return null;
  }
}
