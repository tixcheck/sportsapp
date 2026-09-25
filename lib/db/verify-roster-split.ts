/**
 * Does the stats tab now put drafted players in the full-time table?
 *
 *   npx tsx lib/db/verify-roster-split.ts
 *
 * Read-only. Runs the REAL `rosterKeys` and `isFullTime` over the REAL
 * `competition_player_names` rows, rather than re-implementing the keying rule
 * in SQL. A diagnostic that reimplements the thing it is checking will confirm
 * a fix that does not exist in the code path the page runs.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

import { isFullTime, rosterKeys } from "@/lib/stats/roster-split";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const comps = await sql`
    select id, name from competitions
     where track_appearances = true
     order by start_date desc nulls last`;

  for (const comp of comps) {
    // Must be the same function getFullTimeRoster calls (0136). Checking
    // against competition_player_names would report the old behaviour and pass
    // a fix that never reached the page.
    const roster = await sql`
      select user_id, name from competition_roster_aliases(${comp.id})`;
    const keys = rosterKeys(
      roster.map((r) => ({
        userId: r.user_id as string | null,
        name: r.name as string | null,
      })),
    );

    const people = await sql`
      select distinct user_id, player_name
        from (
          select user_id, player_name from match_appearances
           where competition_id = ${comp.id}
          union
          select user_id, player_name from match_absences
           where competition_id = ${comp.id}
        ) x`;

    const full: string[] = [];
    const subs: string[] = [];
    for (const p of people) {
      const row = {
        userId: p.user_id as string | null,
        name: String(p.player_name),
      };
      (isFullTime(row, keys) ? full : subs).push(row.name);
    }
    if (people.length === 0) continue;

    console.log(`\n${comp.name}`);
    console.log(`  roster keys ${keys.size} · stat rows ${people.length}`);
    console.log(`  full-time ${full.length} · subs ${subs.length}`);
    console.log(`  subs: ${subs.sort().join(", ") || "(none)"}`);
  }

  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
