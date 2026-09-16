/**
 * Apply 0124 — whether teams referee each other.
 *
 *   npx tsx lib/db/apply-0124.ts
 *
 * Safe to re-run: `add column if not exists`.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0124_teams_referee.sql",
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
    select column_name, data_type, is_nullable, column_default
      from information_schema.columns
     where table_schema = 'public' and table_name = 'competitions'
       and column_name = 'teams_referee'`;
  if (!col) {
    console.error("  MISSING  competitions.teams_referee");
    process.exit(1);
  }
  console.log(
    `  ok       competitions.teams_referee ${col.data_type} null=${col.is_nullable} default=${col.column_default}`,
  );

  // Default true means nothing changes for anything that already exists.
  const [counts] = await sql`
    select count(*)::int as total,
           count(*) filter (where teams_referee)::int as reffed
      from competitions`;
  console.log(
    `  competitions: ${counts.total}, teams_referee=true: ${counts.reffed}`,
  );
  if (counts.total !== counts.reffed) {
    console.error("  UNEXPECTED  some competition already opted out");
    process.exit(1);
  }

  console.log("\n0124 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
