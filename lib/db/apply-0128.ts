/**
 * Apply 0128 — how many courts a gym has.
 *
 *   npx tsx lib/db/apply-0128.ts
 *
 * Safe to re-run: `add column if not exists`, and the check constraint is
 * guarded by name.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0128_venue_courts.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const [col] = await sql`
    select data_type, is_nullable, column_default
      from information_schema.columns
     where table_schema = 'public' and table_name = 'venues'
       and column_name = 'courts'`;
  if (!col) {
    console.error("  MISSING  venues.courts");
    process.exit(1);
  }
  console.log(
    `  ok       venues.courts ${col.data_type} null=${col.is_nullable} default=${col.column_default ?? "(none)"}`,
  );
  // Nullable is the whole compatibility story — see the migration's comment.
  if (col.is_nullable !== "YES") {
    console.error("  WRONG    courts must be NULLABLE ('not stated')");
    process.exit(1);
  }

  const [chk] = await sql`
    select exists(
      select 1 from pg_constraint where conname = 'venues_courts_sane'
    ) as present`;
  console.log(
    chk.present ? "  ok       check constraint" : "  MISSING  check constraint",
  );

  // Every existing venue must read as "not stated": this changes nothing for
  // anyone until an organizer types a number.
  const rows = await sql`
    select count(*)::int as total,
           count(courts)::int as with_courts
      from venues`;
  console.log(
    `  venues: ${rows[0].total} total, ${rows[0].with_courts} with a court count (expect 0 on first run)`,
  );

  if (!chk.present) process.exit(1);
  console.log("\n0128 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
