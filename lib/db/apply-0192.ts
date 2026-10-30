/**
 * Apply 0192 — Reverse Pairs ranking (differential | wins_pct) and bonus points.
 *
 *   npx tsx lib/db/apply-0192.ts
 *
 * Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0192_reverse_pairs_ranking_bonus.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const [c] = await sql`
    select
      (select count(*)::int from information_schema.columns
        where table_name = 'reverse_pairs_settings' and column_name in ('ranking', 'bonus_items')) cols,
      (select relrowsecurity from pg_class where relname = 'reverse_pairs_bonuses') rls,
      has_table_privilege('anon', 'public.reverse_pairs_bonuses', 'insert') anon_ins`;
  console.log(
    `settings columns ${c.cols} of 2; bonuses RLS ${c.rls}; anon insert ${c.anon_ins}`,
  );
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
