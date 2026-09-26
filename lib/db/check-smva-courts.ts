/**
 * What is actually inside divisions.courts for SMVA.
 *
 *   npx tsx lib/db/check-smva-courts.ts
 *
 * READ-ONLY. The step-3 dry run printed "[object Object]" for this column, so
 * it is not the integer its name suggests. Before writing anything near court
 * counts, the real shape has to be on screen — including whether Tier 4 PPL's
 * three entries are a genuine third court or a leftover from when that tier
 * held six teams instead of four.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const rows = await sql`
    select d.name as tier, d.tier_order, d.courts, d.venue_id,
           v.name as venue, v.courts as venue_courts
      from divisions d
      join competitions c on c.id = d.competition_id
      join organizations o on o.id = c.org_id
      left join venues v on v.id = d.venue_id
     where o.slug = 'scarborough-mens-volleyball'
     order by d.tier_order`;

  for (const r of rows) {
    console.log(`\n${r.tier}   (${r.venue ?? "no venue"})`);
    console.log(`  venues.courts = ${r.venue_courts ?? "—"}`);
    console.log(`  divisions.courts =`);
    console.log(JSON.stringify(r.courts, null, 2));
  }

  // Does the league itself carry a court list too? A third place the same
  // fact could live.
  const [ls] = await sql`
    select ls.court_list, ls.weekly_slots
      from league_settings ls
      join competitions c on c.id = ls.competition_id
      join organizations o on o.id = c.org_id
     where o.slug = 'scarborough-mens-volleyball'`;
  console.log(`\nleague_settings.court_list =`);
  console.log(JSON.stringify(ls?.court_list, null, 2));
  console.log(`\nleague_settings.weekly_slots =`);
  console.log(JSON.stringify(ls?.weekly_slots, null, 2));

  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
