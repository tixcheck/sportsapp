/**
 * Apply 0130 — pool captains, sign-up adoption, and the captain's view.
 *
 *   npx tsx lib/db/apply-0130.ts
 *
 * Safe to re-run: `add column if not exists`, `create or replace`, and the
 * grants are re-issued each time.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0130_pool_captains.sql",
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
     where table_schema = 'public' and table_name = 'free_agents'
       and column_name = 'is_captain'`;
  if (!col) {
    console.error("  MISSING  free_agents.is_captain");
    process.exit(1);
  }
  console.log(
    `  ok       free_agents.is_captain ${col.data_type} null=${col.is_nullable} default=${col.column_default}`,
  );

  for (const fn of ["claim_free_agent_signups", "draft_pool"]) {
    const [row] = await sql`
      select p.proname, p.prosecdef
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = ${fn}`;
    if (!row) {
      console.error(`  MISSING  ${fn}`);
      process.exit(1);
    }
    console.log(
      `  ok       ${fn} (security definer=${row.prosecdef ? "yes" : "NO — wrong"})`,
    );
    if (!row.prosecdef) process.exit(1);
  }

  // Both must be callable by an ordinary signed-in player, or a captain sees
  // nothing and the adoption never runs.
  for (const sig of [
    "public.claim_free_agent_signups()",
    "public.draft_pool(uuid)",
  ]) {
    const [g] = await sql`
      select has_function_privilege('authenticated', ${sig}, 'execute') as ok`;
    console.log(
      g.ok ? `  ok       execute: ${sig}` : `  MISSING  grant: ${sig}`,
    );
    if (!g.ok) process.exit(1);
  }

  // THE POINT of draft_pool: it must not be able to leak contact details.
  const cols = await sql`
    select p.proname,
           pg_get_function_result(p.oid) as result
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'draft_pool'`;
  const result = String(cols[0].result);
  const leaks = ["email", "phone", "notes"].filter((c) => result.includes(c));
  console.log(
    leaks.length === 0
      ? "  ok       draft_pool returns no email / phone / notes"
      : `  LEAK     draft_pool returns ${leaks.join(", ")}`,
  );
  if (leaks.length > 0) process.exit(1);

  // Nobody is a captain yet — this changes nothing until an organizer marks one.
  const [tally] = await sql`
    select count(*)::int as total,
           count(*) filter (where is_captain)::int as captains,
           count(*) filter (where user_id is null and email is not null)::int as claimable
      from free_agents`;
  console.log(
    `  free_agents: ${tally.total} rows, ${tally.captains} captains (expect 0), ${tally.claimable} awaiting an account`,
  );

  console.log("\n0130 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
