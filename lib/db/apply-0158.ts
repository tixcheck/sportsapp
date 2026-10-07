/**
 * Apply 0158 — league_settings.schedule_views.
 *
 *   npx tsx lib/db/apply-0158.ts
 *
 * Safe to re-run. Adds a nullable column; no league changes until an
 * organizer picks its views.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0158_schedule_views.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  const [c] = await sql`
    select count(*) filter (where schedule_views is not null)::int set, count(*)::int total
      from league_settings`;
  const [chk] = await sql`
    select pg_get_constraintdef(oid) d from pg_constraint where conname = 'league_settings_schedule_views_check'`;
  console.log({ leaguesWithViews: c.set, of: c.total, check: chk?.d });
  const ok = c.set === 0 && !!chk;
  console.log(ok ? "\n0158 applied and verified." : "\nWRONG");
  await sql.end();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
