/**
 * Apply 0119 — dismissing an uncompleted offline payment request.
 *
 * Adds `dismiss_offline_payment`, a trigger that cancels open requests when a
 * team or free agent is withdrawn, and a one-off correction for rows already
 * stranded behind a withdrawal.
 *
 *   npx tsx lib/db/apply-0119.ts
 *
 * Safe to re-run: the function is `create or replace`, the triggers are dropped
 * first, and the correction only matches rows that are still pending.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const file = "lib/db/migrations/0119_dismiss_offline_payment.sql";
  const statements = readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const before = await sql`
    select count(*)::int n from registration_payments
    where status = 'pending' and method <> 'card'`;
  console.log(`pending offline requests before: ${before[0].n}`);

  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const checks = await sql`
    select 'fn dismiss_offline_payment' as obj,
           exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='dismiss_offline_payment') as present
    union all
    select 'trigger teams_withdraw_cancels_payments',
           exists(select 1 from pg_trigger where tgname='teams_withdraw_cancels_payments')
    union all
    select 'trigger free_agents_withdraw_cancels_payments',
           exists(select 1 from pg_trigger where tgname='free_agents_withdraw_cancels_payments')`;
  let missing = 0;
  for (const c of checks) {
    console.log(c.present ? "  ok      " : "  MISSING ", c.obj);
    if (!c.present) missing++;
  }

  const after = await sql`
    select count(*)::int n from registration_payments
    where status = 'pending' and method <> 'card'`;
  console.log(`pending offline requests after:  ${after[0].n}`);

  const stranded = await sql`
    select count(*)::int n from registration_payments rp
    where rp.status = 'pending' and rp.method <> 'card'
      and (exists (select 1 from teams t where t.id=rp.team_id and t.status='withdrawn')
        or exists (select 1 from free_agents fa where fa.id=rp.free_agent_id and fa.status='withdrawn'))`;
  console.log(
    `still stranded behind a withdrawal: ${stranded[0].n} (should be 0)`,
  );
  if (stranded[0].n !== 0) missing++;

  if (missing > 0) {
    console.error("FAILED");
    process.exit(1);
  }
  console.log("\n0119 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
