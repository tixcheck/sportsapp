/**
 * Look up Scarborough Men's eight gyms and print what Google returns.
 *
 * Read-only — it writes nothing. The eight names come off their score sheets,
 * which give a gym name and nothing else: "Bethune", "Leacock A", "Agincourt".
 * Those are Toronto schools, so the query is qualified with the city to stop a
 * bare "Porter" resolving to a building on another continent.
 *
 * Leacock A/B and Porter/Wexford are separate TIERS but Leacock A and B are the
 * same building, so the search term is the school and the tier keeps the suffix.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const KEY =
  process.env.GOOGLE_PLACES_API_KEY?.trim() ||
  process.env.GOOGLE_MAPS_API_KEY?.trim();

/** tier label -> what to search for. */
const GYMS: { tier: string; gym: string; query: string }[] = [
  {
    tier: "Tier 1",
    gym: "Bethune",
    query: "Dr Norman Bethune Collegiate Institute, Scarborough, Toronto, ON",
  },
  {
    tier: "Tier 2A",
    gym: "Leacock A",
    query: "Stephen Leacock Collegiate Institute, Scarborough, Toronto, ON",
  },
  {
    tier: "Tier 2B",
    gym: "Leacock B",
    query: "Stephen Leacock Collegiate Institute, Scarborough, Toronto, ON",
  },
  {
    tier: "Tier 3",
    gym: "Agincourt",
    query: "Agincourt Collegiate Institute, Scarborough, Toronto, ON",
  },
  {
    tier: "Tier 4",
    gym: "Père-Philippe-Lamarche",
    query: "École secondaire Père-Philippe-Lamarche, Scarborough, Toronto, ON",
  },
  {
    tier: "Tier 5A",
    gym: "Porter",
    query: "Porter Collegiate Institute, Scarborough, Toronto, ON",
  },
  {
    tier: "Tier 5B",
    gym: "Wexford",
    query: "Wexford Collegiate School for the Arts, Scarborough, Toronto, ON",
  },
  {
    tier: "Tier 6",
    gym: "King",
    query:
      "Sir Robert L Borden Business and Technical Institute King campus, Scarborough, Toronto, ON",
  },
];

interface Place {
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: { longText?: string; types?: string[] }[];
}

async function lookup(query: string): Promise<Place[]> {
  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": KEY!,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.addressComponents",
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 3,
        regionCode: "CA",
        locationBias: {
          // Scarborough, not downtown Toronto.
          circle: {
            center: { latitude: 43.7764, longitude: -79.2318 },
            radius: 15000,
          },
        },
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!res.ok) {
    console.error(`   lookup failed: HTTP ${res.status}`);
    return [];
  }
  const body = (await res.json()) as { places?: Place[] };
  return body.places ?? [];
}

async function main() {
  if (!KEY) {
    console.error("GOOGLE_PLACES_API_KEY is not set.");
    process.exit(1);
  }
  for (const g of GYMS) {
    const places = await lookup(g.query);
    const best = places[0];
    console.log(`\n${g.tier}  ·  ${g.gym}`);
    if (!best) {
      console.log("   NO MATCH — needs the real address from the organizer");
      continue;
    }
    const part = (t: string) =>
      best.addressComponents?.find((c) => c.types?.includes(t))?.longText ?? "";
    console.log(`   name:     ${best.displayName?.text ?? "?"}`);
    console.log(`   address:  ${best.formattedAddress ?? "?"}`);
    console.log(
      `   locality: ${part("locality")}  postal: ${part("postal_code")}`,
    );
    if (places.length > 1) {
      console.log(
        `   (other candidates: ${places
          .slice(1)
          .map((p) => p.displayName?.text)
          .join(" | ")})`,
      );
    }
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
