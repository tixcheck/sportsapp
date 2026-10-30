/**
 * Apply 0189 — security audit, batch 1.
 *
 *   npx tsx lib/db/apply-0189.ts
 *
 * Waitlist offers organizer/cron only, no captain match inserts, scorekeepers
 * may record defaults. Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0189_security_batch1.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const [w] = await sql`
    select has_function_privilege('anon', 'public.offer_next_waitlist_spot(uuid, uuid)', 'execute') anon,
           has_function_privilege('authenticated', 'public.offer_next_waitlist_spot(uuid, uuid)', 'execute') auth`;
  const [pol] = await sql`
    select count(*)::int n from pg_policies where tablename = 'matches' and policyname = 'matches_captain_insert'`;
  const [g] = await sql`
    select position('double_default' in prosrc) > 0 ok from pg_proc where proname = 'matches_guard_scorer_update'`;
  console.log(
    `offer_next_waitlist_spot anon=${w.anon} authenticated=${w.auth}`,
  );
  console.log(`matches_captain_insert policies left: ${pol.n}`);
  console.log(`scorer guard allows scorekeeper defaults: ${g.ok}`);
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
