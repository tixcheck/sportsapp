/**
 * Apply 0177 — in-app support chat.
 *
 *   npx tsx lib/db/apply-0177.ts
 *
 * Creates support_threads + support_messages and the support_* functions. Run once.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync("lib/db/migrations/0177_support_chat.sql", "utf8");
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const [t] = await sql`
    select (select count(*)::int from pg_tables where tablename in ('support_threads','support_messages')) tables,
           (select count(*)::int from pg_proc where proname like 'support\_%') functions`;
  console.log("support tables:", t.tables, "· functions:", t.functions);
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
