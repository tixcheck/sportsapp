/**
 * Apply 0125 — save the playoff format.
 *
 *   npx tsx lib/db/apply-0125.ts
 *
 * Safe to re-run: every statement is `add column if not exists` / `comment on`.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0125_playoff_format.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const cols = await sql`
    select column_name, data_type, is_nullable, column_default
      from information_schema.columns
     where table_schema = 'public' and table_name = 'tournament_settings'
       and column_name in ('playoff_advance_mode','playoff_third_place','playoff_courts','playoff_teams')
     order by column_name`;
  for (const c of cols) {
    console.log(
      `  ok       ${c.column_name} ${c.data_type} null=${c.is_nullable} default=${c.column_default ?? "-"}`,
    );
  }
  if (cols.length !== 4) {
    console.error(`  MISSING  expected 4 columns, found ${cols.length}`);
    process.exit(1);
  }

  // The check constraint is the thing most likely to be silently absent.
  const [chk] = await sql`
    select exists(
      select 1 from information_schema.constraint_column_usage u
       join information_schema.check_constraints c using (constraint_name)
      where u.table_name = 'tournament_settings'
        and u.column_name = 'playoff_advance_mode'
    ) as present`;
  console.log(
    chk.present
      ? "  ok       advance-mode check constraint"
      : "  MISSING  check constraint",
  );

  // Nothing should have been set yet — the panel keeps its defaults until saved.
  const [rows] = await sql`
    select count(*)::int as total,
           count(playoff_advance_mode)::int as with_mode
      from tournament_settings`;
  console.log(
    `  tournament_settings: ${rows.total}, with a saved mode: ${rows.with_mode}`,
  );

  console.log("\n0125 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
