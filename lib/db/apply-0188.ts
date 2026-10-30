/**
 * Apply 0188 — a league's own rules.
 *
 *   npx tsx lib/db/apply-0188.ts
 *
 * One jsonb column on competitions and a check that it's an array. Safe to
 * re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0188_competition_rules.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const [chk] = await sql`
    select count(*)::int as cols from information_schema.columns
     where table_name = 'competitions' and column_name = 'rules'`;
  const [con] = await sql`
    select count(*)::int as n from pg_constraint where conname = 'competitions_rules_is_array'`;
  console.log(`competitions.rules: ${chk.cols} of 1, check: ${con.n} of 1`);
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
