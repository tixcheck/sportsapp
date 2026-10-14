/**
 * Load BVL's APPROVED 2026/27 gym permits (0155) from the permit PDFs.
 *
 *   npx tsx lib/db/load-bvl-permit-pdfs-2026.ts            # report only
 *   npx tsx lib/db/load-bvl-permit-pdfs-2026.ts --write    # replace BVL's permits
 *
 * Source: lib/db/data/bvl-permit-pdfs-2026.json, extracted from the 19 permits
 * BVL holds (City of Brampton rental agreements; Peel and Dufferin-Peel board
 * permits), shared 2026-10-14. They replace the Oct 7 availability workbook
 * (`load-bvl-permits-2026.ts`) as the record of when a gym can be used: the
 * workbook had Terry Miller Thursday at 6:30–10:30 when the permit says 6–10,
 * and the schedule was built on it.
 *
 * Each permit is a gym, a weekday and the hours it recurs at. A night inside
 * its range that the permit doesn't book, or marks Cancelled, is `cancelled`;
 * a night booked at other hours is `changed`. Back-to-back bookings on one
 * night (Chinguacousy 6–8 + 8–10) were merged into one window.
 *
 * What the PDFs don't say — how many courts BVL nets in a gym and what it
 * calls them — is kept from the workbook permit for the same gym and night.
 *
 * Idempotent: --write replaces the workbook's permits and any earlier load of
 * this file, and leaves anything else alone.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const WRITE = process.argv.includes("--write");
const SOURCE = "bvl-permit-pdfs-2026";
const REPLACES = ["bvl-permits-2026", SOURCE];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Exception = {
  date: string;
  status: "cancelled" | "changed";
  start?: string;
  end?: string;
  note: string;
};
type Permit = {
  venue: string;
  label: string | null;
  dayOfWeek: number;
  start: string;
  end: string;
  startsOn: string;
  endsOn: string;
  permitNumbers: string[];
  exceptions: Exception[];
};

async function main() {
  const data = JSON.parse(
    readFileSync("lib/db/data/bvl-permit-pdfs-2026.json", "utf8"),
  ) as { permits: Permit[] };
  const [org] =
    await sql`select id from organizations where name = 'Brampton Volleyball League'`;
  const venues =
    await sql`select id, name from venues where org_id = ${org.id}`;
  const venueId = new Map(
    venues.map((v) => [v.name as string, v.id as string]),
  );
  const unknown = [...new Set(data.permits.map((p) => p.venue))].filter(
    (v) => !venueId.has(v),
  );
  if (unknown.length) throw new Error(`no saved venue: ${unknown.join(", ")}`);

  // Courts and their names, from the workbook's permit for that gym and night.
  const old = await sql`
    select venue_id, day_of_week, label, courts, court_labels, purpose
      from venue_permits where org_id = ${org.id} and source = ${REPLACES[0]}`;
  const courtsFor = (p: Permit) => {
    const id = venueId.get(p.venue)!;
    const same = old.filter(
      (o) => o.venue_id === id && o.day_of_week === p.dayOfWeek,
    );
    const hit =
      same.find((o) => (o.label ?? null) === p.label) ??
      old.find((o) => o.venue_id === id && (o.label ?? null) === p.label);
    if (!hit)
      throw new Error(`no court count for ${p.venue} ${DAYS[p.dayOfWeek]}`);
    return {
      courts: hit.courts as number,
      labels: hit.court_labels as string[] | null,
      purpose: (same.find((o) => o.purpose)?.purpose as string | null) ?? null,
    };
  };

  for (const p of data.permits) {
    const c = courtsFor(p);
    const off = p.exceptions.filter((e) => e.status === "cancelled");
    console.log(
      `${DAYS[p.dayOfWeek]} ${p.venue.padEnd(46)} ${(p.label ?? `${c.courts} courts`).padEnd(10)} ${p.start}-${p.end}  ${p.startsOn}..${p.endsOn}  off ${off.length}, changed ${p.exceptions.length - off.length}`,
    );
  }
  if (!WRITE) {
    console.log("\nnothing written — pass --write");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    const gone = await tx`delete from venue_permits
      where org_id = ${org.id} and source = any(${REPLACES}) returning id`;
    let dates = 0;
    for (const p of data.permits) {
      const c = courtsFor(p);
      const [row] = await tx`
        insert into venue_permits (org_id, venue_id, day_of_week, label, courts, court_labels,
                                   start_time, end_time, starts_on, ends_on, purpose, source)
        values (${org.id}, ${venueId.get(p.venue)!}, ${p.dayOfWeek}, ${p.label}, ${c.courts},
                ${c.labels}, ${p.start}, ${p.end}, ${p.startsOn}, ${p.endsOn}, ${c.purpose},
                ${SOURCE})
        returning id`;
      for (const e of p.exceptions) {
        await tx`
          insert into venue_permit_dates (permit_id, on_date, status, start_time, end_time, note)
          values (${row.id}, ${e.date}, ${e.status}, ${e.start ?? null}, ${e.end ?? null}, ${e.note})`;
        dates++;
      }
    }
    console.log(
      `\nreplaced ${gone.length} permits with ${data.permits.length}, ${dates} dates`,
    );
  });
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
