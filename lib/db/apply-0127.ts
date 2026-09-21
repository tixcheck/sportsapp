/**
 * Apply 0127 — a record of removed individual sign-ups.
 *
 *   npx tsx lib/db/apply-0127.ts
 *
 * Safe to re-run: `create table if not exists`, guarded indexes, and the
 * function is `create or replace`. The policies are NOT guarded by Postgres, so
 * they are created only when absent — see `policy` handling below.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

const EXPECTED_POLICIES = [
  "removed_signups_select",
  "removed_signups_insert",
  "removed_signups_update",
  "removed_signups_delete",
];

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0127_removed_signups.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await sql.begin(async (tx) => {
    for (const stmt of statements) {
      // `create policy` has no IF NOT EXISTS. Re-running the migration should
      // be a no-op rather than an error, so an already-present policy is
      // skipped instead of aborting the whole transaction.
      if (/^create policy/i.test(stmt)) {
        const name = stmt.match(/create policy\s+"([^"]+)"/i)?.[1];
        if (name) {
          const [{ present }] = await tx`
            select exists(
              select 1 from pg_policies
              where schemaname = 'public'
                and tablename = 'removed_signups'
                and policyname = ${name}
            ) as present`;
          if (present) continue;
        }
      }
      await tx.unsafe(stmt);
    }
  });
  console.log(`applied ${statements.length} statements`);

  const cols = await sql`
    select column_name, data_type, is_nullable
      from information_schema.columns
     where table_schema = 'public' and table_name = 'removed_signups'
     order by ordinal_position`;
  if (cols.length === 0) {
    console.error("  MISSING  table removed_signups");
    process.exit(1);
  }
  console.log(`  ok       removed_signups (${cols.length} columns)`);
  for (const c of cols) {
    console.log(
      `             ${c.column_name} ${c.data_type} null=${c.is_nullable}`,
    );
  }

  const [{ rls }] = await sql`
    select relrowsecurity as rls from pg_class
     where oid = 'public.removed_signups'::regclass`;
  console.log(rls ? "  ok       RLS enabled" : "  MISSING  RLS NOT ENABLED");

  const policies = await sql`
    select policyname, cmd from pg_policies
     where schemaname = 'public' and tablename = 'removed_signups'
     order by policyname`;
  const found = policies.map((p) => p.policyname as string);
  for (const want of EXPECTED_POLICIES) {
    console.log(
      found.includes(want)
        ? `  ok       policy ${want}`
        : `  MISSING  policy ${want}`,
    );
  }

  // The UPDATE policy is the one that differs from restore_points, and the one
  // the editable note depends on. Worth naming rather than counting.
  const [{ present: fn }] = await sql`
    select exists(
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'remove_free_agent'
    ) as present`;
  console.log(
    fn ? "  ok       remove_free_agent()" : "  MISSING  remove_free_agent()",
  );

  // Nothing should be in here yet — a row would mean this ran against a
  // database where something already removed a sign-up through the new path.
  const [{ n }] = await sql`select count(*)::int as n from removed_signups`;
  console.log(`  rows: ${n}`);

  const ok =
    rls &&
    fn &&
    EXPECTED_POLICIES.every((p) => found.includes(p)) &&
    cols.length > 0;
  if (!ok) {
    console.error("\n0127 did NOT fully apply.");
    process.exit(1);
  }
  console.log("\n0127 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
