/**
 * Apply 0122 — undo an offline payment confirmed by mistake.
 *
 *   npx tsx lib/db/apply-0122.ts
 *
 * Safe to re-run: the function is `create or replace`.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0122_unconfirm_offline_payment.sql",
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
    select exists(
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'unconfirm_offline_payment'
    ) as present`;
  const grants = await sql`
    select grantee from information_schema.role_routine_grants
    where routine_name = 'unconfirm_offline_payment' and grantee in ('authenticated', 'anon', 'public')`;

  console.log(
    fn.present ? "  ok       function present" : "  MISSING  function",
  );
  console.log(
    `  grants: ${grants.map((g) => g.grantee).join(", ") || "(none)"}`,
  );

  if (!fn.present) {
    console.error("FAILED");
    process.exit(1);
  }
  console.log("\n0122 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
