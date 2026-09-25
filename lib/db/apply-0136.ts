/**
 * Apply 0136 — competition_roster_aliases().
 *
 *   npx tsx lib/db/apply-0136.ts
 *
 * Safe to re-run: create or replace, and the grant is re-issued.
 *
 * Verified against the three players it exists for rather than by checking the
 * function is present. "It returns rows" would have passed before this fix too.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0136_roster_aliases.sql",
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
    select p.prosecdef
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'competition_roster_aliases'`;
  if (!fn?.prosecdef) {
    console.error("  WRONG    missing or not security definer");
    process.exit(1);
  }
  console.log("  ok       security definer");

  const [g] = await sql`
    select has_function_privilege(
      'anon', 'public.competition_roster_aliases(uuid)', 'execute'
    ) as ok`;
  console.log(g.ok ? "  ok       anon may execute" : "  MISSING  anon grant");
  if (!g.ok) process.exit(1);

  const [comp] = await sql`
    select id, name from competitions
     where name ilike '%big shoot%' order by start_date desc nulls last limit 1`;
  if (!comp) {
    console.log("\n0136 applied.");
    await sql.end();
    return;
  }

  // The three the migration exists for: drafted under one name, account under
  // another. Both must now come back.
  const wanted = ["Jack Sullivan", "Jake Schuller", "Mike Fleming"];
  const aliases = await sql`
    select lower(btrim(name)) as n
      from competition_roster_aliases(${comp.id})`;
  const have = new Set(aliases.map((a) => a.n as string));

  console.log(`\n  ${comp.name}: ${aliases.length} aliases`);
  let missing = 0;
  for (const w of wanted) {
    const ok = have.has(w.toLowerCase());
    console.log(`      ${ok ? "ok      " : "MISSING "} ${w}`);
    if (!ok) missing += 1;
  }
  if (missing > 0) {
    console.error(`  ${missing} of the three still absent`);
    process.exit(1);
  }

  console.log("\n0136 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
