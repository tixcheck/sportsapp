/**
 * Load BVL's 2026/27 gym permits (0155) from the organizer's workbook.
 *
 *   npx tsx lib/db/load-bvl-permits-2026.ts            # report only
 *   npx tsx lib/db/load-bvl-permits-2026.ts --write    # replace BVL's permits
 *
 * Source: lib/db/data/bvl-permits-2026.json, extracted from BVL's "PERMIT
 * AVAILABILITY 2026-2027" workbook (shared 2026-10-07): one tab per night,
 * a column per gym (courts, hours), a row per date, the colour of each cell
 * saying whether the gym is booked (green), cancelled (red), going to be
 * cancelled (yellow) or awaiting a cancellation (orange); break bands mark
 * Winter Break, March Break and Holy Week. Fridays come from the MASTER tab.
 *
 * Gyms are matched to BVL's saved venues by name. The two the app didn't
 * have — Edmund Campion and Sandalwood Heights — are added under exactly the
 * names the sheet uses, with no address: their official names and addresses
 * are BVL's to give, not ours to guess.
 *
 * Idempotent: --write replaces every permit this file loaded before
 * (`source` = SOURCE) and leaves anything else alone.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const WRITE = process.argv.includes("--write");
const SOURCE = "bvl-permits-2026";

type Exception = {
  date: string;
  status: string;
  start?: string;
  end?: string;
  note: string | null;
};
type Permit = {
  night: string;
  dayOfWeek: number;
  gym: string;
  courtsText: string;
  start: string;
  end: string;
  startsOn: string;
  endsOn: string;
  exceptions: Exception[];
};

/** Sheet name → the venue BVL already has saved. */
const VENUE_FOR: Record<string, string> = {
  "Notre Dame": "Notre Dame Catholic Secondary School",
  "St. Marguerite D'Youville": "St. Marguerite d'Youville Secondary School",
  "St. Thomas Aquinas": "St. Thomas Aquinas Catholic Secondary School",
  "Jim Archdekin": "Jim Archdekin Recreation Centre",
  "Gore Meadows": "Gore Meadow Community Centre",
  "North Park": "North Park Secondary School",
  "Terry Miller": "Terry Miller Recreation Centre",
  "Cassie Campbell": "Cassie Campbell Community Centre",
  Chinguacousy: "Chinguacousy Secondary School",
  // First loaded under the sheet's short names; BVL then entered the real
  // ones with addresses (2026-10-07) and the duplicate Campion was merged.
  "Edmund Campion": "St. Edmund Campion Secondary School",
  "Sandalwood Heights": "Sandalwood Heights Secondary School",
};

/** "3 Courts" → 1,2,3 · "Court A/B" → A,B · "Court C" → C. */
function courtsOf(text: string): {
  courts: number;
  labels: string[];
  label: string | null;
} {
  const n = /^(\d+)\s+Courts?$/i.exec(text.trim());
  if (n) {
    const count = Number(n[1]);
    return {
      courts: count,
      labels: Array.from({ length: count }, (_, i) => String(i + 1)),
      label: null,
    };
  }
  const named = /^Courts?\s+([A-Z](?:\/[A-Z])*)$/i.exec(text.trim());
  if (named) {
    const labels = named[1].toUpperCase().split("/");
    return {
      courts: labels.length,
      labels,
      label: `${labels.length > 1 ? "Courts" : "Court"} ${labels.join("/")}`,
    };
  }
  throw new Error(`can't read courts from "${text}"`);
}

async function main() {
  const data = JSON.parse(
    readFileSync("lib/db/data/bvl-permits-2026.json", "utf8"),
  ) as { source: string; permits: Permit[] };

  const [org] =
    await sql`select id from organizations where name = 'Brampton Volleyball League'`;
  const venues =
    await sql`select id, name, courts from venues where org_id = ${org.id}`;
  const venueId = new Map(
    venues.map((v) => [v.name as string, v.id as string]),
  );

  const missing = [
    ...new Set(data.permits.map((p) => VENUE_FOR[p.gym] ?? `?${p.gym}`)),
  ].filter((n) => !venueId.has(n));
  if (missing.some((n) => n.startsWith("?"))) {
    throw new Error(
      `unmapped gyms: ${missing.filter((n) => n.startsWith("?")).join(", ")}`,
    );
  }

  for (const p of data.permits) {
    const c = courtsOf(p.courtsText);
    const off = p.exceptions.filter(
      (e) => e.status !== "changed" && e.status !== "available_note",
    );
    console.log(
      `${p.night.padEnd(9)} ${VENUE_FOR[p.gym].padEnd(46)} ${(c.label ?? `${c.courts} courts`).padEnd(12)} ${p.start}-${p.end}  ${p.startsOn}..${p.endsOn}  off ${off.length}, changed ${p.exceptions.length - off.length}`,
    );
  }
  console.log(`\nnew venues: ${missing.length ? missing.join(", ") : "none"}`);
  if (!WRITE) {
    console.log("\nnothing written — pass --write");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    for (const name of missing) {
      const [v] =
        await tx`insert into venues (org_id, name) values (${org.id}, ${name}) returning id`;
      venueId.set(name, v.id as string);
    }
    await tx`delete from venue_permits where org_id = ${org.id} and source = ${SOURCE}`;
    let dates = 0;
    for (const p of data.permits) {
      const c = courtsOf(p.courtsText);
      const [row] = await tx`
        insert into venue_permits (org_id, venue_id, day_of_week, label, courts, court_labels,
                                   start_time, end_time, starts_on, ends_on, purpose, source)
        values (${org.id}, ${venueId.get(VENUE_FOR[p.gym])!}, ${p.dayOfWeek}, ${c.label}, ${c.courts},
                ${c.labels}, ${p.start}, ${p.end}, ${p.startsOn}, ${p.endsOn},
                ${p.night === "Pickup" ? "Pickup" : null}, ${SOURCE})
        returning id`;
      for (const e of p.exceptions) {
        await tx`
          insert into venue_permit_dates (permit_id, on_date, status, start_time, end_time, note)
          values (${row.id}, ${e.date}, ${e.status}, ${e.start ?? null}, ${e.end ?? null}, ${e.note})`;
        dates++;
      }
    }
    // A venue's court count, where BVL never stated one (never overwritten).
    const totals = new Map<string, number>();
    for (const p of data.permits) {
      const v = VENUE_FOR[p.gym];
      totals.set(
        `${v}|${p.dayOfWeek}`,
        (totals.get(`${v}|${p.dayOfWeek}`) ?? 0) +
          courtsOf(p.courtsText).courts,
      );
    }
    const maxCourts = new Map<string, number>();
    for (const [k, n] of totals) {
      const v = k.split("|")[0];
      maxCourts.set(v, Math.max(maxCourts.get(v) ?? 0, n));
    }
    for (const [v, n] of maxCourts) {
      await tx`update venues set courts = ${n} where id = ${venueId.get(v)!} and courts is null`;
    }
    console.log(`\nwrote ${data.permits.length} permits, ${dates} dates`);
  });

  console.log(
    await sql`select p.day_of_week, count(*)::int permits, sum(p.courts)::int courts,
                     (select count(*)::int from venue_permit_dates d join venue_permits q on q.id = d.permit_id
                       where q.org_id = ${org.id} and q.day_of_week = p.day_of_week) dates
                from venue_permits p where p.org_id = ${org.id} group by 1 order by 1`,
  );
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
