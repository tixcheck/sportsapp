/**
 * Apply 0155 — venue_permits / venue_permit_dates (gym permits).
 *
 *   npx tsx lib/db/apply-0155.ts
 *
 * Safe to re-run. Loading BVL's permits is a separate step:
 * lib/db/load-bvl-permits-2026.ts.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0155_venue_permits.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  const tables = await sql`
    select table_name, (select relrowsecurity from pg_class where relname = table_name) rls
      from information_schema.tables where table_name in ('venue_permits', 'venue_permit_dates')`;
  console.log(tables);
  const ok = tables.length === 2 && tables.every((t) => t.rls);
  console.log(ok ? "\n0155 applied and verified." : "\nWRONG");
  await sql.end();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
