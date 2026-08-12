"use server";

import { z } from "zod";

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

/** Biased to Toronto: this is a Toronto volleyball community app, and an
 *  unbiased search surfaces same-named gyms on other continents. */
const TORONTO = { latitude: 43.6532, longitude: -79.3832 };

export async function searchVenuesAction(
  query: string,
): Promise<PlaceSuggestion[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
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
          includedRegionCodes: ["ca"],
          locationBias: {
            circle: { center: TORONTO, radius: 50_000 },
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
