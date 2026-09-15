/**
 * Apply 0121 — nights per session, and the absences table.
 *
 *   npx tsx lib/db/apply-0121.ts
 *
 * Safe to re-run: every statement is `if not exists`, guarded, or a
 * drop-then-create policy.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0121_sessions_and_absences.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const checks = await sql`
    select 'league_settings.session_nights' as obj,
           exists(select 1 from information_schema.columns
                  where table_name = 'league_settings' and column_name = 'session_nights') as present
    union all
    select 'check league_settings_session_nights_range',
           exists(select 1 from pg_constraint where conname = 'league_settings_session_nights_range')
    union all
    select 'table match_absences',
           exists(select 1 from information_schema.tables where table_name = 'match_absences')
    union all
    select 'check match_absences_name_not_blank',
           exists(select 1 from pg_constraint where conname = 'match_absences_name_not_blank')
    union all
    select 'index match_absences_unique_user',
           exists(select 1 from pg_indexes where indexname = 'match_absences_unique_user')
    union all
    select 'index match_absences_unique_guest',
           exists(select 1 from pg_indexes where indexname = 'match_absences_unique_guest')
    union all
    select 'index match_absences_competition_idx',
           exists(select 1 from pg_indexes where indexname = 'match_absences_competition_idx')
    union all
    select 'index match_absences_match_idx',
           exists(select 1 from pg_indexes where indexname = 'match_absences_match_idx')`;

  let missing = 0;
  for (const c of checks) {
    console.log(c.present ? "  ok      " : "  MISSING ", c.obj);
    if (!c.present) missing += 1;
  }

  const [rls] = await sql`
    select relrowsecurity from pg_class where relname = 'match_absences'`;
  console.log(
    rls?.relrowsecurity ? "  ok       RLS enabled" : "  MISSING  RLS",
  );
  if (!rls?.relrowsecurity) missing += 1;

  const policies = await sql`
    select policyname, cmd from pg_policies
    where tablename = 'match_absences' order by policyname`;
  console.log(
    "  policies:",
    policies.map((p) => `${p.policyname}(${p.cmd})`).join(", "),
  );
  if (policies.length !== 4) missing += 1;

  if (missing > 0) {
    console.error(`FAILED: ${missing} object(s) missing.`);
    process.exit(1);
  }
  console.log("\n0121 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
