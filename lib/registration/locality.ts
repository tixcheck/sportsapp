/**
 * Working out which town a player gave as their address.
 *
 * Brampton Volleyball League is built for Brampton residents and wants to see,
 * per team, how many actually are. That is a question about a CITY, and a city
 * is not reliably recoverable from a line of text: "130 Brampton Road,
 * Toronto" contains the word and means the opposite of what a search for it
 * would conclude.
 *
 * So the city comes from Google's structured components where a player picked
 * a suggestion, and only falls back to reading the text when they typed one
 * out. The fallback is deliberately narrow, and anything it can't place is
 * reported as UNKNOWN rather than guessed — an organizer told "4 of 6 from
 * Brampton" can act on it, and told a number quietly built from guesses
 * cannot.
 */

export type LocalitySource = "structured" | "geocoded" | "text" | "unknown";

export type AddressLocality = {
  /** The town, when we have one. */
  city: string | null;
  source: LocalitySource;
};

/** What `resolveAddressAction` puts alongside an address answer. */
export type AddressMetadata = {
  locality?: string | null;
  region?: string | null;
  postalCode?: string | null;
  /**
   * How the town was arrived at. Absent means the player picked a suggestion
   * and Google returned the components — the original, certain case.
   * "geocoded" means they typed a line and we looked it up afterwards: a
   * strong inference, but not their own selection, and worth being able to
   * separate when an organizer is counting residents.
   */
  source?: LocalitySource | null;
};

/**
 * A Google `formattedAddress` is "street, city, region postcode, country".
 * Reading the city out of that is reliable ONLY because we know Google wrote
 * it. Applied to something a person typed, the same split is a guess, which is
 * why the source is reported and not thrown away.
 */
function cityFromFormatted(address: string): string | null {
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  // street, city, region+postcode, country — the city is second of four.
  if (parts.length < 4) return null;
  const city = parts[parts.length - 3];
  return city && /^[\p{L}][\p{L}\s'.-]*$/u.test(city) ? city : null;
}

export function addressLocality(
  answer: string,
  metadata?: AddressMetadata | null,
): AddressLocality {
  const structured = metadata?.locality?.trim();
  if (structured) {
    return {
      city: structured,
      source: metadata?.source === "geocoded" ? "geocoded" : "structured",
    };
  }

  const text = (answer ?? "").trim();
  if (!text) return { city: null, source: "unknown" };

  const guessed = cityFromFormatted(text);
  return guessed
    ? { city: guessed, source: "text" }
    : { city: null, source: "unknown" };
}

/** Case- and space-insensitive, because "brampton " is Brampton. */
export function sameCity(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type LocalityTally = {
  home: number;
  away: number;
  unknown: number;
  /** Everyone counted, so a caller can show "4 of 6" honestly. */
  total: number;
};

/**
 * Count a roster against the competition's home town.
 *
 * Someone with no address answer at all counts as UNKNOWN, not as away. They
 * have not said they live elsewhere; they have not said anything, and a tally
 * that treats silence as an answer misleads in the direction of "this team is
 * mostly outsiders".
 */
export function tallyLocalities(
  people: { answer: string; metadata?: AddressMetadata | null }[],
  homeCity: string | null,
): LocalityTally {
  const tally: LocalityTally = {
    home: 0,
    away: 0,
    unknown: 0,
    total: people.length,
  };

  for (const person of people) {
    const { city } = addressLocality(person.answer, person.metadata);
    if (!city || !homeCity) {
      tally.unknown += 1;
    } else if (sameCity(city, homeCity)) {
      tally.home += 1;
    } else {
      tally.away += 1;
    }
  }
  return tally;
}
