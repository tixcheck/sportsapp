/**
 * Apply 0133 — a per-game cap on what one result can swing.
 *
 *   npx tsx lib/db/apply-0133.ts
 *
 * Safe to re-run: `add column if not exists` and a guarded constraint.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0133_reverse_pairs_point_cap.sql",
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
     where table_schema = 'public'
       and table_name = 'reverse_pairs_settings'
       and column_name = 'point_cap'`;
  if (!col) {
    console.error("  MISSING  reverse_pairs_settings.point_cap");
    process.exit(1);
  }
  console.log(
    `  ok       point_cap ${col.data_type} null=${col.is_nullable} default=${col.column_default ?? "(none)"}`,
  );
  // Nullable is the compatibility story: a default would rewrite the standings
  // of every night already played.
  if (col.is_nullable !== "YES" || col.column_default !== null) {
    console.error("  WRONG    point_cap must be NULLABLE with no default");
    process.exit(1);
  }

  const [chk] = await sql`
    select exists(
      select 1 from pg_constraint
       where conname = 'reverse_pairs_settings_point_cap_check'
    ) as present`;
  console.log(
    chk.present ? "  ok       sanity check" : "  MISSING  sanity check",
  );
  if (!chk.present) process.exit(1);

  const [tally] = await sql`
    select count(*)::int as total, count(point_cap)::int as capped
      from reverse_pairs_settings`;
  console.log(
    `  reverse pairs events: ${tally.total}, ${tally.capped} with a cap (expect 0 on first run)`,
  );

  console.log("\n0133 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
