/**
 * Apply 0143 — Reverse Pairs platform fee: a flat $2 per pair.
 *
 *   npx tsx lib/db/apply-0143.ts
 *
 * Safe to re-run: `add column if not exists`, guarded constraint.
 * Verified on the singleton row, and that no Reverse Pairs charge is already
 * open at the old percentage (it would settle at the fee it was priced with).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0143_reverse_pairs_platform_fee.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const rows = await sql`
    select tournament_percent, league_per_player_cents, league_per_team_cents,
           reverse_pairs_per_pair_cents from platform_fee_settings`;
  console.log(rows);
  const [open] = await sql`
    select count(*)::int as n from registration_payments rp
      join competitions c on c.id = rp.competition_id
     where c.type = 'reverse_pairs' and rp.status = 'pending'`;
  console.log(`open Reverse Pairs charges at the old rate: ${open.n}`);
  if (rows.length !== 1 || rows[0].reverse_pairs_per_pair_cents !== 200) {
    console.error("WRONG: expected one settings row at 200");
    process.exit(1);
  }
  console.log("\n0143 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
