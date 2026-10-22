/**
 * Apply 0186 — pared-down standings columns, switched on for BVL.
 *
 *   npx tsx lib/db/apply-0186.ts
 *
 * One column, then BVL's running leagues set to 'simple' (they asked for
 * SW, SL, +/- and ratio only). Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0186_standings_columns.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const bvl = await sql`
    update league_settings ls set standings_columns = 'simple'
    from competitions c join organizations o on o.id = c.org_id
    where ls.competition_id = c.id
      and o.name ilike '%brampton%'
      and c.status <> 'completed'
    returning c.name`;
  console.log(`simple standings: ${bvl.map((r) => r.name).join("; ")}`);
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
