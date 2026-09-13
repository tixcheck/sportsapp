/**
 * Apply migrations 0117 and 0118 — ladder night results, sheet notes, officials.
 *
 * Both were written in the Scarborough sessions and never applied. 0117 adds
 * `result_rank`/`result_points` to `ladder_placements` (the whole point of the
 * SMVA model: type the night's finishing order instead of forty set scores);
 * 0118 adds `league_settings.sheet_notes` and the `ladder_night_officials`
 * table, which is where the printed sheet's standing instructions and named
 * refs live.
 *
 * Order matters only in that 0117 is numbered first; they touch different
 * tables and neither depends on the other. Each runs in its own transaction so
 * one failing does not half-apply the other.
 *
 *   npx tsx lib/db/apply-0117-0118.ts
 *
 * Safe to re-run: every statement is `if not exists` or a duplicate_object
 * guard.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

const FILES = [
  "lib/db/migrations/0117_ladder_night_results.sql",
  "lib/db/migrations/0118_sheet_notes_and_officials.sql",
];

async function main() {
  for (const file of FILES) {
    const statements = readFileSync(file, "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    await sql.begin(async (tx) => {
      for (const stmt of statements) await tx.unsafe(stmt);
    });
    console.log(`applied ${file} (${statements.length} statements)`);
  }

  const checks = await sql`
    select 'ladder_placements.result_rank' as obj,
           exists(select 1 from information_schema.columns
                  where table_name='ladder_placements' and column_name='result_rank') as present
    union all
    select 'ladder_placements.result_points',
           exists(select 1 from information_schema.columns
                  where table_name='ladder_placements' and column_name='result_points')
    union all
    select 'index ladder_placements_result_rank_unique',
           exists(select 1 from pg_indexes where indexname='ladder_placements_result_rank_unique')
    union all
    select 'check ladder_placements_result_rank_positive',
           exists(select 1 from pg_constraint where conname='ladder_placements_result_rank_positive')
    union all
    select 'check ladder_placements_result_points_nonneg',
           exists(select 1 from pg_constraint where conname='ladder_placements_result_points_nonneg')
    union all
    select 'league_settings.sheet_notes',
           exists(select 1 from information_schema.columns
                  where table_name='league_settings' and column_name='sheet_notes')
    union all
    select 'check league_settings_sheet_notes_is_array',
           exists(select 1 from pg_constraint where conname='league_settings_sheet_notes_is_array')
    union all
    select 'table ladder_night_officials',
           exists(select 1 from information_schema.tables
                  where table_name='ladder_night_officials')
    union all
    select 'unique ladder_night_officials_division_week_key',
           exists(select 1 from pg_constraint where conname='ladder_night_officials_division_week_key')
    union all
    select 'index ladder_night_officials_competition_week_idx',
           exists(select 1 from pg_indexes where indexname='ladder_night_officials_competition_week_idx')`;

  let missing = 0;
  for (const r of checks) {
    console.log(r.present ? "  ok      " : "  MISSING ", r.obj);
    if (!r.present) missing++;
  }

  const [rls] = await sql`
    select relrowsecurity from pg_class where relname = 'ladder_night_officials'`;
  console.log(
    rls?.relrowsecurity ? "  ok       RLS enabled" : "  MISSING  RLS",
  );
  if (!rls?.relrowsecurity) missing++;

  const policies = await sql`
    select policyname from pg_policies
    where schemaname='public' and tablename='ladder_night_officials'
    order by policyname`;
  console.log(
    "  policies:",
    policies.map((p) => p.policyname).join(", ") || "(none)",
  );
  if (policies.length !== 2) missing++;

  if (missing > 0) {
    console.error(`FAILED: ${missing} object(s) missing.`);
    process.exit(1);
  }
  console.log("\nBoth migrations applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
