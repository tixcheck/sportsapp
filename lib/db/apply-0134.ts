/**
 * Apply 0134 — my_pool_signups() returns the competition's visibility.
 *
 *   npx tsx lib/db/apply-0134.ts
 *
 * Safe to re-run: the function is dropped and recreated, and the grant is
 * re-issued. Dropping is necessary rather than tidy — a function's RETURNS
 * TABLE signature cannot be changed by `create or replace`.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0134_pool_signups_visibility.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const [fn] = await sql`
    select pg_get_function_result(p.oid) as result, p.prosecdef
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'my_pool_signups'`;
  if (!fn) {
    console.error("  MISSING  my_pool_signups");
    process.exit(1);
  }

  const returnsVisibility = /visibility/.test(String(fn.result));
  console.log(
    returnsVisibility
      ? "  ok       returns visibility"
      : "  WRONG    visibility not in the return signature",
  );
  if (!returnsVisibility) process.exit(1);

  console.log(
    fn.prosecdef
      ? "  ok       security definer"
      : "  WRONG    not security definer",
  );
  if (!fn.prosecdef) process.exit(1);

  const [g] = await sql`
    select has_function_privilege(
      'authenticated', 'public.my_pool_signups()', 'execute'
    ) as ok`;
  console.log(g.ok ? "  ok       execute granted" : "  MISSING  execute grant");
  if (!g.ok) process.exit(1);

  // Which pool sign-ups will now become clickable, and which stay plain text.
  const rows = await sql`
    select c.name, c.visibility::text as visibility, count(*)::int as n
      from free_agents f
      join competitions c on c.id = f.competition_id
     where f.user_id is not null
       and f.status in ('available', 'pending_payment')
     group by c.name, c.visibility
     order by c.name`;
  console.log(`\n  pool sign-ups by event:`);
  for (const r of rows) {
    console.log(
      `      ${r.n}  ${r.name}  (${r.visibility}${r.visibility === "public" ? " — links" : " — stays plain text"})`,
    );
  }

  console.log("\n0134 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
