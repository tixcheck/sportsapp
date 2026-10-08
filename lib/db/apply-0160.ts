/**
 * Apply 0160 — league_settings.session_playoff.
 *
 *   npx tsx lib/db/apply-0160.ts
 *
 * Safe to re-run. Every league keeps its playoff night (default true) until
 * an organizer turns it off; settings history now tracks the field.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0160_session_playoff.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  const [c] = await sql`
    select count(*) filter (where not session_playoff)::int off_, count(*)::int total
      from league_settings`;
  const [t] = await sql`
    select pg_get_triggerdef(oid) d from pg_trigger
     where tgname = 'settings_history' and tgrelid = 'league_settings'::regclass`;
  console.log({ leaguesWithoutSessionPlayoff: c.off_, of: c.total });
  const ok =
    c.off_ === 0 &&
    t.d.includes("session_playoff") &&
    t.d.includes("session_nights");
  console.log(ok ? "\n0160 applied and verified." : "\nWRONG");
  await sql.end();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
