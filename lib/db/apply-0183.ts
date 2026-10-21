/**
 * Apply 0183 — record defaults (no-shows) per set, and double defaults.
 *
 *   npx tsx lib/db/apply-0183.ts
 *
 * Two columns. Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync("lib/db/migrations/0183_match_defaults.sql", "utf8");
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const cols = await sql`
    select table_name, column_name from information_schema.columns
    where (table_name = 'matches' and column_name in ('double_default', 'default_side'))
       or (table_name = 'sets' and column_name = 'defaulted_by')`;
  console.log(cols.map((c) => `${c.table_name}.${c.column_name}`).join(", "));
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
