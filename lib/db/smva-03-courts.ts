/**
 * SMVA step 3 of 3 — courts, and the Leacock merge.
 *
 *   npx tsx lib/db/smva-03-courts.ts            # report only
 *   npx tsx lib/db/smva-03-courts.ts --write    # apply
 *
 * The 2026/2027 sheet is the source of truth for how many courts each gym
 * runs, read off its setup duties: each tier assigns one team per court to put
 * up nets and poles, so the highest court number in a tier IS that gym's court
 * count. Owner: "If the sheet says 2 courts just mark it as 2 courts. If they
 * want to add additional courts later that can be accommodated."
 *
 * Three tiers disagreed, and all three are leftovers from the structure step 1
 * replaced:
 *
 *     Leacock  2 -> 3   was split across Gym A and Gym B
 *     PPL      3 -> 2   was a six-team tier, now four
 *     Porter   2 -> 3   was half of a shared 5A/5B tier
 *
 * The check that settles it: every tier's court count is exactly teams / 2.
 * Four teams cannot occupy three courts, which is why PPL is 2 and not 3.
 *
 * THREE PLACES HOLD COURTS, and they are not rivals:
 *   venues.courts            how many the BUILDING has (0128) — a default
 *   divisions.courts         the court LIST a tier plays on (LeagueCourt[])
 *   league_settings.court_list  the same list for the whole league
 * The last is rebuilt from the tiers so it cannot drift from them. It still
 * carries Gym B's two courts today, which is exactly that kind of drift.
 *
 * `weekly_slots` is deliberately untouched: one Monday 19:20 slot carrying
 * `courts: 3`, which is only a fallback for when court_list is absent.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const write = process.argv.includes("--write");

const ORG = "scarborough-mens-volleyball";
const SLUG = "smva-monday-ladder-2026-2027";

/** Leacock A and B become one gym. The B record stays, simply unused. */
const VENUE_RENAME = {
  from: "Stephen Leacock CI — Gym A",
  to: "Stephen Leacock CI",
};
const TIER_RENAME = { from: "Tier 2 — Leacock A", to: "Tier 2 — Leacock" };
const RETIRED_VENUE = "Stephen Leacock CI — Gym B";

/** Tier (after renaming) -> its gym and the courts the sheet gives it. */
const PLAN: { tier: string; venue: string; courts: number }[] = [
  { tier: "Tier 1 — Bethune", venue: "Dr. Norman Bethune CI", courts: 3 },
  { tier: TIER_RENAME.to, venue: VENUE_RENAME.to, courts: 3 },
  { tier: "Tier 3 — Agincourt", venue: "Agincourt CI", courts: 3 },
  { tier: "Tier 4 — PPL", venue: "Père-Philippe-Lamarche", courts: 2 },
  { tier: "Tier 5 — Porter", venue: "SATEC @ W. A. Porter CI", courts: 3 },
  { tier: "Tier 6 — Wexford", venue: "Wexford CS for the Arts", courts: 2 },
  { tier: "Tier 7 — King", venue: "R.H. King Academy", courts: 3 },
];

type LeagueCourt = { label: string; prime: boolean; venueId: string };

const courtsFor = (venueId: string, n: number): LeagueCourt[] =>
  Array.from({ length: n }, (_, i) => ({
    label: String(i + 1),
    prime: false,
    venueId,
  }));

async function main() {
  const [org] = await sql`
    select id, name from organizations where slug = ${ORG}`;
  const [comp] = await sql`
    select id, name from competitions where slug = ${SLUG}`;
  if (!org || !comp) {
    console.error("FAILED: org or league not found");
    process.exit(1);
  }
  console.log(`${comp.name}\n`);

  const venues = await sql`
    select id, name, courts from venues where org_id = ${org.id} order by name`;
  const divs = await sql`
    select id, name, tier_order, venue_id, courts
      from divisions where competition_id = ${comp.id} order by tier_order`;

  // Everything must be exactly as steps 1 and 2 left it.
  const problems: string[] = [];
  const venueByName = new Map(venues.map((v) => [v.name as string, v]));
  if (
    !venueByName.has(VENUE_RENAME.from) &&
    !venueByName.has(VENUE_RENAME.to)
  ) {
    problems.push(
      `no venue named "${VENUE_RENAME.from}" or "${VENUE_RENAME.to}"`,
    );
  }
  const divByName = new Map(divs.map((d) => [d.name as string, d]));
  for (const p of PLAN) {
    const known =
      divByName.has(p.tier) ||
      (p.tier === TIER_RENAME.to && divByName.has(TIER_RENAME.from));
    if (!known) problems.push(`no tier named "${p.tier}"`);
  }
  if (divs.length !== PLAN.length) {
    problems.push(`found ${divs.length} tiers, expected ${PLAN.length}`);
  }
  if (problems.length > 0) {
    console.error("  REFUSED: not in the expected state.");
    for (const p of problems) console.error(`      ${p}`);
    process.exit(1);
  }

  console.log("  renames:");
  console.log(`      venue  ${VENUE_RENAME.from}  ->  ${VENUE_RENAME.to}`);
  console.log(`      tier   ${TIER_RENAME.from}  ->  ${TIER_RENAME.to}`);
  console.log(`      ${RETIRED_VENUE} stays as a venue, used by no tier\n`);

  console.log("  courts (sheet is the source of truth):");
  for (const p of PLAN) {
    const d =
      divByName.get(p.tier) ??
      divByName.get(p.tier === TIER_RENAME.to ? TIER_RENAME.from : p.tier)!;
    const had = ((d.courts as LeagueCourt[] | null) ?? []).length;
    const teams = await sql`
      select count(*)::int as n from teams where division_id = ${d.id}`;
    const flag = had === p.courts ? "" : `   ${had} -> ${p.courts}`;
    console.log(
      `      ${String(p.tier).padEnd(20)} ${teams[0].n} teams · ${p.courts} courts${flag}`,
    );
  }

  const totalCourts = PLAN.reduce((n, p) => n + p.courts, 0);
  const [ls] = await sql`
    select court_list from league_settings where competition_id = ${comp.id}`;
  const hadList = ((ls?.court_list as LeagueCourt[] | null) ?? []).length;
  console.log(`\n      league court_list ${hadList} -> ${totalCourts} entries`);

  if (!write) {
    console.log("\n  nothing written — pass --write to apply");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    const fromVenue = venueByName.get(VENUE_RENAME.from);
    if (fromVenue) {
      await tx`
        update venues set name = ${VENUE_RENAME.to} where id = ${fromVenue.id}`;
    }
    const fromTier = divByName.get(TIER_RENAME.from);
    if (fromTier) {
      await tx`
        update divisions set name = ${TIER_RENAME.to} where id = ${fromTier.id}`;
    }

    const list: LeagueCourt[] = [];
    for (const p of PLAN) {
      const [v] = await tx`
        select id from venues where org_id = ${org.id} and name = ${p.venue}`;
      if (!v) throw new Error(`venue "${p.venue}" vanished mid-transaction`);
      await tx`update venues set courts = ${p.courts} where id = ${v.id}`;

      const [d] = await tx`
        select id from divisions
         where competition_id = ${comp.id} and name = ${p.tier}`;
      if (!d) throw new Error(`tier "${p.tier}" vanished mid-transaction`);

      const courts = courtsFor(v.id as string, p.courts);
      // postgres.js encodes jsonb itself — pre-stringifying double-encodes.
      await tx`
        update divisions set courts = ${sql.json(courts)}, venue_id = ${v.id}
         where id = ${d.id}`;
      list.push(...courts);
    }

    await tx`
      update league_settings set court_list = ${sql.json(list)}
       where competition_id = ${comp.id}`;
  });

  const after = await sql`
    select d.name as tier, d.courts, v.name as venue, v.courts as venue_courts,
           (select count(*)::int from teams t where t.division_id = d.id) as teams
      from divisions d
      left join venues v on v.id = d.venue_id
     where d.competition_id = ${comp.id}
     order by d.tier_order`;
  const [ls2] = await sql`
    select court_list from league_settings where competition_id = ${comp.id}`;

  console.log("\n  after:");
  let ok = true;
  for (const r of after) {
    const want = PLAN.find((p) => p.tier === r.tier);
    const listLen = ((r.courts as LeagueCourt[] | null) ?? []).length;
    const good =
      want && listLen === want.courts && r.venue_courts === want.courts;
    if (!good) ok = false;
    console.log(
      `      ${String(r.tier).padEnd(20)} ${r.teams} teams · list ${listLen} ·` +
        ` venue ${r.venue_courts ?? "—"}  ${String(r.venue ?? "—")}` +
        `${good ? "" : "   WRONG"}`,
    );
  }
  const listLen = ((ls2?.court_list as LeagueCourt[] | null) ?? []).length;
  console.log(`\n      league court_list ${listLen} entries`);
  if (listLen !== totalCourts) ok = false;

  const [orphan] = await sql`
    select count(*)::int as n from venues
     where org_id = ${org.id} and name = ${RETIRED_VENUE} and courts is null`;
  console.log(
    `      ${RETIRED_VENUE}: ${orphan.n === 1 ? "left null, unused" : "unexpected"}`,
  );

  console.log(ok ? "\n  ok  courts follow the sheet" : "\n  WRONG  see above");
  if (!ok) process.exit(1);

  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
