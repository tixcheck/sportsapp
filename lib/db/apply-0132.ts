/**
 * Apply 0132 — "you are in the pool for this league" on the dashboard.
 *
 *   npx tsx lib/db/apply-0132.ts
 *
 * Safe to re-run: `create or replace` plus re-issued grants.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0132_my_pool_signups.sql",
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
    select pg_get_functiondef(p.oid) as def, p.prosecdef
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'my_pool_signups'`;
  if (!fn) {
    console.error("  MISSING  my_pool_signups");
    process.exit(1);
  }
  console.log(
    fn.prosecdef
      ? "  ok       security definer"
      : "  WRONG    not security definer",
  );
  if (!fn.prosecdef) process.exit(1);

  // It must not list somebody who is already on a team — they appear under
  // "Competitions you play in", and saying it twice reads as two things.
  const def = String(fn.def);
  const excludesPlaced = !/'placed'/.test(def) || /in \('available'/.test(def);
  console.log(
    excludesPlaced
      ? "  ok       only available / pending_payment"
      : "  WRONG    would list placed players too",
  );
  if (!excludesPlaced) process.exit(1);

  const [g] = await sql`
    select has_function_privilege(
      'authenticated', 'public.my_pool_signups()', 'execute'
    ) as ok`;
  console.log(g.ok ? "  ok       execute granted" : "  MISSING  execute grant");
  if (!g.ok) process.exit(1);

  // Who this actually lights up: linked accounts sitting unplaced in a pool.
  const rows = await sql`
    select c.name, count(*)::int as n
      from free_agents f
      join competitions c on c.id = f.competition_id
     where f.user_id is not null
       and f.status in ('available', 'pending_payment')
     group by c.name
     order by n desc`;
  const total = rows.reduce((s, r) => s + Number(r.n), 0);
  console.log(`  ${total} linked players are in a pool and will now see it:`);
  for (const r of rows) console.log(`      ${r.n}  ${r.name}`);

  console.log("\n0132 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
