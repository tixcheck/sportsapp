/**
 * Apply 0190 — security audit, batch 2.
 *
 *   npx tsx lib/db/apply-0190.ts
 *
 * Rate-limit table and `take_rate_limit`; unpaid-admission notes moved off the
 * public teams row; internal definer functions no longer callable directly.
 * Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0190_security_batch2.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const [cols] = await sql`
    select count(*)::int as n from information_schema.columns
     where table_name = 'teams' and column_name in ('admitted_unpaid_note', 'admitted_unpaid_by')`;
  const [moved] =
    await sql`select count(*)::int as n from team_unpaid_admissions`;
  const fns = await sql`
    select p.proname, has_function_privilege('anon', p.oid, 'execute') anon,
           has_function_privilege('authenticated', p.oid, 'execute') auth
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in
       ('fill_roster_appearances', 'alignment_advance', 'reverse_pair_base_name',
        'platform_fee_debts', 'org_payment_account', 'take_rate_limit')
     order by 1`;
  console.log(
    `teams note/by columns left: ${cols.n} of 0; admissions rows: ${moved.n}`,
  );
  for (const f of fns)
    console.log(`${f.proname}: anon=${f.anon} authenticated=${f.auth}`);
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
