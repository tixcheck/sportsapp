/**
 * Apply 0185 — record a payment for an individual sign-up.
 *
 *   npx tsx lib/db/apply-0185.ts
 *
 * One function. Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0185_record_individual_payment.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const [f] = await sql`
    select pg_get_function_identity_arguments(oid) args from pg_proc
    where proname = 'record_individual_payment'`;
  console.log(f ? `record_individual_payment(${f.args})` : "function MISSING");
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
