/**
 * Apply 0129 — an organizer-added player may have no email.
 *
 *   npx tsx lib/db/apply-0129.ts
 *
 * Safe to re-run: `create or replace`, and the grants are re-issued as 0090
 * issued them.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0129_organizer_add_individual_email.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  // The fix itself: the function body must now null out a blank email.
  const [fn] = await sql`
    select pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'organizer_add_individual'`;
  if (!fn) {
    console.error("  MISSING  organizer_add_individual");
    process.exit(1);
  }
  const fixed = /nullif\(lower\(btrim\(coalesce\(_email/.test(fn.def as string);
  console.log(
    fixed
      ? "  ok       blank email now stores NULL"
      : "  WRONG    function still inserts an empty string",
  );
  if (!fixed) process.exit(1);

  // And it must still be callable by ordinary signed-in organizers.
  const [grant] = await sql`
    select has_function_privilege(
      'authenticated',
      'public.organizer_add_individual(uuid, text, text, text, text[], skill_level, text)',
      'execute'
    ) as ok`;
  console.log(
    grant.ok ? "  ok       execute granted" : "  MISSING  execute grant",
  );
  if (!grant.ok) process.exit(1);

  // Nothing should have an empty-string email; this is what the check forbids.
  const [rows] = await sql`
    select count(*)::int as total,
           count(*) filter (where email = '')::int as empties
      from free_agents`;
  console.log(
    `  free_agents: ${rows.total} rows, ${rows.empties} empty-string emails (expect 0)`,
  );

  console.log("\n0129 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
