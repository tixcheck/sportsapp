/**
 * Apply 0184 — both teams can default a single set.
 *
 *   npx tsx lib/db/apply-0184.ts
 *
 * Widens one check constraint. Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0184_set_double_default.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const [c] = await sql`
    select pg_get_constraintdef(oid) def from pg_constraint
    where conname = 'sets_defaulted_by_check'`;
  console.log(c?.def ?? "constraint MISSING");
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
