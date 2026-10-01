/**
 * Apply 0147 — free_agents.invited_at / invited_email.
 *
 *   npx tsx lib/db/apply-0147.ts
 *
 * Safe to re-run: `add column if not exists`.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0147_drafted_player_invites.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  const cols = await sql`
    select column_name, data_type from information_schema.columns
     where table_name = 'free_agents' and column_name in ('invited_at', 'invited_email')
     order by column_name`;
  console.log(cols);
  const ok = cols.length === 2;
  console.log(ok ? "\n0147 applied and verified." : "\nWRONG");
  await sql.end();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
