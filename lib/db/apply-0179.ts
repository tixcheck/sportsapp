/**
 * Apply 0179 — league_settings.net_duty (off by default).
 *
 *   npx tsx lib/db/apply-0179.ts
 *
 * Adds one column. Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync("lib/db/migrations/0179_net_duty.sql", "utf8");
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const [f] = await sql`
    select count(*)::int n from information_schema.columns
    where table_name = 'league_settings' and column_name = 'net_duty'`;
  console.log("league_settings.net_duty present:", f.n === 1);
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
