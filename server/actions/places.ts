"use server";

import { z } from "zod";

import {
  resolveCandidates,
  shouldGeocode,
  type PlaceCandidate,
} from "@/lib/registration/geocode";
import type { AddressMetadata } from "@/lib/registration/locality";

/**
 * Venue lookup via Google Places Autocomplete.
 *
 * Proxied through a Server Action rather than called from the browser so
 * `GOOGLE_PLACES_API_KEY` stays server-only. A browser-side Places key has to be
 * public and is restricted by HTTP referrer, which is a weaker control than
 * simply never shipping it — and this way the key can be rotated without a
 * client rebuild.
 *
 * Returns an empty list when the key is absent, which is what lets the venue
 * field degrade to a plain text input on deployments that haven't set one up.
 */

const querySchema = z.string().trim().min(3).max(120);

export type PlaceSuggestion = {
  /** What goes in the venue field — the place's name, or its address. */
  label: string;
  /** Fuller context shown under the label, e.g. the street address. */
  detail: string;
};

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

const BIAS = {
  latitude: num(process.env.PLACES_BIAS_LAT, 43.6532),
  longitude: num(process.env.PLACES_BIAS_LNG, -79.3832),
};

const REGION_CODES = (process.env.PLACES_REGION_CODES ?? "ca")
  .split(",")
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean);

function placesKey(): string | null {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
}

export async function searchVenuesAction(
  query: string,
): Promise<PlaceSuggestion[]> {
  const key = placesKey();
  if (!key) return [];

  const parsed = querySchema.safeParse(query);
  if (!parsed.success) return [];

  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
        },
        body: JSON.stringify({
          input: parsed.data,
          includedRegionCodes: REGION_CODES,
          locationBias: {
            circle: { center: BIAS, radius: 50_000 },
          },
        }),
        // Venue names don't change often and organizers retype the same few.
        next: { revalidate: 3600 },
      },
    );

    if (!res.ok) {
      // Never surface Google's error text — it can echo the request, and a
      // failed lookup should degrade to typing, not to an error message.
      console.error("[places] autocomplete request failed", res.status);
      return [];
    }

    const body = (await res.json()) as {
      suggestions?: {
        placePrediction?: {
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
          text?: { text?: string };
        };
      }[];
    };

    return (body.suggestions ?? [])
      .map((s) => {
        const p = s.placePrediction;
        const label =
          p?.structuredFormat?.mainText?.text ?? p?.text?.text ?? "";
        const detail = p?.structuredFormat?.secondaryText?.text ?? "";
        return { label, detail };
      })
      .filter((s) => s.label.length > 0)
      .slice(0, 6);
  } catch {
    console.error("[places] autocomplete threw");
    return [];
  }
}

// ---------------------------------------------------------------------------
// Address autocomplete
// ---------------------------------------------------------------------------
//
// The same key and the same proxying as venue search above, for a different
// question: a venue lookup wants a place's NAME ("Chinguacousy Wellness
// Centre"), a registrant's address wants the formatted line. Different shape,
// so a separate function rather than a flag on the first.

export type AddressSuggestion = {
  /** What goes in the field when picked, and what's shown in the list. */
  text: string;
  /** Google's id, used only as a list key. */
  id: string;
};

/**
 * Whether address autocomplete can work at all.
 *
 * Read by the field so it renders a plain input where no key is configured,
 * rather than a control that looks like it should suggest and never does.
 */
export async function addressAutocompleteAvailableAction(): Promise<boolean> {
  return !!placesKey();
}

const addressSchema = z.object({
  query: z.string().trim().min(4).max(200),
  /** Groups a burst of keystrokes into one billable session. */
  sessionToken: z.string().trim().max(64).optional(),
});

export async function suggestAddressesAction(
  input: z.input<typeof addressSchema>,
): Promise<{ suggestions: AddressSuggestion[] }> {
  const key = placesKey();
  if (!key) return { suggestions: [] };

  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return { suggestions: [] };

  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
        },
        body: JSON.stringify({
          input: parsed.data.query,
          includedRegionCodes: REGION_CODES,
          // No location bias: a league's players live across a region, and
          // biasing to the venue would bury anyone on the far side of it.
          ...(parsed.data.sessionToken
            ? { sessionToken: parsed.data.sessionToken }
            : {}),
        }),
        // Someone is typing. A slow answer is worse than none.
        signal: AbortSignal.timeout(4000),
      },
    );

    if (!res.ok) {
      // A quota or billing problem is ours; the field still works as plain
      // text, so the person filling in the form is told nothing they can act on.
      console.error("[places] address autocomplete failed", res.status);
      return { suggestions: [] };
    }

    const body = (await res.json()) as {
      suggestions?: {
        placePrediction?: { text?: { text?: string }; placeId?: string };
      }[];
    };

    return {
      suggestions: (body.suggestions ?? [])
        .map((s) => ({
          text: s.placePrediction?.text?.text ?? "",
          id: s.placePrediction?.placeId ?? s.placePrediction?.text?.text ?? "",
        }))
        .filter((s) => s.text.length > 0)
        .slice(0, 6),
    };
  } catch {
    console.error("[places] address autocomplete threw");
    return { suggestions: [] };
  }
}

const resolveSchema = z.object({
  /** Google's opaque id from a suggestion. Never shown, never stored. */
  placeId: z.string().trim().min(4).max(300),
  /** The SAME token the suggestions were fetched with — see below. */
  sessionToken: z.string().trim().max(64).optional(),
});

/**
 * Turn a chosen suggestion into a full address, postal code included.
 *
 * Autocomplete returns a LABEL — "130 River Street, Toronto, ON, Canada" — and
 * a label has no postal code in it. The postal code only exists on the place
 * itself, so picking a suggestion needs this second lookup.
 *
 * Passing the same session token as the suggestions is what makes those
 * keystrokes and this lookup bill as one session rather than several separate
 * calls. It is a cost decision, not a correctness one, which is why the field
 * still works if it is missing.
 *
 * Returns null on any failure. The caller then keeps the label it already had:
 * an address without its postal code is worth more than an empty field and an
 * error about a lookup the person never asked for.
 */
export type ResolvedAddress = {
  address: string | null;
  /** The town, as Google classifies it — not as the text happens to read. */
  locality: string | null;
  region: string | null;
  postalCode: string | null;
};

const EMPTY: ResolvedAddress = {
  address: null,
  locality: null,
  region: null,
  postalCode: null,
};

export async function resolveAddressAction(
  input: z.input<typeof resolveSchema>,
): Promise<ResolvedAddress> {
  const key = placesKey();
  if (!key) return EMPTY;

  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return EMPTY;

  const query = parsed.data.sessionToken
    ? `?sessionToken=${encodeURIComponent(parsed.data.sessionToken)}`
    : "";

  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(parsed.data.placeId)}${query}`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          // Only the one field. The mask decides the billing tier, and asking
          // for coordinates or opening hours we'd never use costs more.
          // Two fields, not the whole place. The mask decides the billing
          // tier, and coordinates or opening hours we'd never read still cost.
          "X-Goog-FieldMask": "formattedAddress,addressComponents",
        },
        signal: AbortSignal.timeout(4000),
      },
    );

    if (!res.ok) {
      console.error("[places] details failed", res.status);
      return EMPTY;
    }

    const body = (await res.json()) as {
      formattedAddress?: string;
      addressComponents?: { longText?: string; types?: string[] }[];
    };

    const part = (type: string) =>
      body.addressComponents?.find((c) => c.types?.includes(type))?.longText ??
      null;

    return {
      address: body.formattedAddress?.trim() || null,
      // `locality` is the town. Some places have none — an unincorporated
      // area, say — so postal_town is tried next rather than reporting a
      // neighbourhood or a county as somebody's city.
      locality: part("locality") ?? part("postal_town"),
      region: part("administrative_area_level_1"),
      postalCode: part("postal_code"),
    };
  } catch {
    console.error("[places] details threw");
    return EMPTY;
  }
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
