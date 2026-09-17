/**
 * Apply 0126 — how a ladder's season table is scored.
 *
 *   npx tsx lib/db/apply-0126.ts
 *
 * Safe to re-run: `add column if not exists`, and the constraint is guarded.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0126_ladder_scoring.sql",
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
     where table_schema = 'public' and table_name = 'league_settings'
       and column_name = 'ladder_scoring'`;
  if (!col) {
    console.error("  MISSING  league_settings.ladder_scoring");
    process.exit(1);
  }
  console.log(
    `  ok       ladder_scoring ${col.data_type} null=${col.is_nullable} default=${col.column_default}`,
  );

  const [chk] = await sql`
    select exists(
      select 1 from pg_constraint
      where conname = 'league_settings_ladder_scoring_check'
    ) as present`;
  console.log(
    chk.present ? "  ok       check constraint" : "  MISSING  check constraint",
  );

  // Every existing league must still be on 'points' — this changes nothing
  // until a league is explicitly switched over.
  const rows = await sql`
    select ladder_scoring, count(*)::int as n
      from league_settings group by ladder_scoring order by ladder_scoring`;
  console.log(
    `  leagues: ${rows.map((r) => `${r.ladder_scoring}=${r.n}`).join(", ")}`,
  );
  const stray = rows.filter((r) => r.ladder_scoring !== "points");
  if (stray.length > 0) {
    console.error("  UNEXPECTED  a league is already off 'points'");
    process.exit(1);
  }

  if (!chk.present) process.exit(1);
  console.log("\n0126 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
