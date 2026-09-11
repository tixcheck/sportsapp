/**
 * Backfill the town for addresses that were TYPED rather than picked.
 *
 * New answers are geocoded at save time. The ones already in the database were
 * not, so they still read "Not known" on the Where-players-live card — 8 of
 * BVL's 22 captains, every one of them with a perfectly good address.
 *
 * Run it yourself (the permission classifier blocks live-DB writes from the
 * agent):
 *
 *   ! npx tsx lib/db/backfill-localities.ts          # dry run, changes nothing
 *   ! npx tsx lib/db/backfill-localities.ts --write  # actually saves
 *
 * Safe to re-run: it only touches answers that have no town yet, and an
 * ambiguous lookup is left alone rather than guessed at.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

import {
  resolveCandidates,
  shouldGeocode,
  type PlaceCandidate,
} from "../registration/geocode";
import type { AddressMetadata } from "../registration/locality";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const WRITE = process.argv.includes("--write");

const KEY =
  process.env.GOOGLE_PLACES_API_KEY?.trim() ||
  process.env.GOOGLE_MAPS_API_KEY?.trim();

async function lookup(value: string): Promise<AddressMetadata | null> {
  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": KEY!,
        "X-Goog-FieldMask": "places.addressComponents,places.formattedAddress",
      },
      body: JSON.stringify({
        textQuery: value.trim(),
        maxResultCount: 2,
        regionCode: "CA",
        locationBias: {
          circle: {
            center: { latitude: 43.6532, longitude: -79.3832 },
            radius: 50000,
          },
        },
      }),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!res.ok) {
    console.error(`    lookup failed: HTTP ${res.status}`);
    return null;
  }
  const body = (await res.json()) as { places?: PlaceCandidate[] };
  return resolveCandidates(body.places);
}

async function main() {
  if (!KEY) {
    console.error("GOOGLE_PLACES_API_KEY is not set — nothing to do.");
    process.exit(1);
  }
  console.log(
    WRITE
      ? "WRITING changes.\n"
      : "DRY RUN — nothing is saved. Add --write to apply.\n",
  );

  const rows = await sql<
    {
      id: string;
      value: string;
      metadata: AddressMetadata | null;
      org: string;
    }[]
  >`
    select ra.id, ra.value, ra.metadata, o.name as org
    from registration_answers ra
    join registration_questions q on q.id = ra.question_id
    join competitions c on c.id = ra.competition_id
    join organizations o on o.id = c.org_id
    where q.kind = 'address'
    order by o.name, ra.value`;

  let resolved = 0;
  let ambiguous = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!shouldGeocode(row.value, row.metadata)) {
      skipped += 1;
      continue;
    }
    process.stdout.write(`  ${row.org} · "${row.value}"\n`);
    const found = await lookup(row.value);
    if (!found) {
      console.log("    -> no confident match, left as not known");
      ambiguous += 1;
      continue;
    }
    console.log(
      `    -> ${found.locality}${found.postalCode ? ` (${found.postalCode})` : ""}`,
    );
    resolved += 1;
    if (WRITE) {
      await sql`
        update registration_answers
           set metadata = ${sql.json(found as never)}, updated_at = now()
         where id = ${row.id}`;
    }
  }

  console.log(
    `\n${rows.length} address answers · ${skipped} already had a town · ` +
      `${resolved} resolved · ${ambiguous} left unknown`,
  );
  if (!WRITE && resolved > 0) console.log("Re-run with --write to save these.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
