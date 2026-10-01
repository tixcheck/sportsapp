/**
 * Apply 0149 — link_free_agent_account(): organizer-side claim for one row.
 *
 *   npx tsx lib/db/apply-0149.ts
 *
 * Safe to re-run. Verified in a rolled-back transaction: a player (no
 * organizer rights) is refused; then the stranded rows are left for
 * backfill-0131-claim.ts, which applies the same rule to all of them.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const ROLLBACK = new Error("rollback");

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0149_link_drafted_player_now.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  // A non-organizer must be refused.
  const [row] =
    await sql`select f.id from free_agents f where f.user_id is null and f.email is not null limit 1`;
  const [outsider] = await sql`
    select u.id from users u
     where not exists (select 1 from org_members m where m.user_id = u.id)
     limit 1`;
  const refused = await sql
    .begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claim.sub', ${outsider.id}, true)`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: outsider.id, role: "authenticated" })}, true)`;
      await tx`select public.link_free_agent_account(${row.id})`;
      throw ROLLBACK;
    })
    .then(() => "allowed")
    .catch((e) => (e === ROLLBACK ? "allowed" : e.message));
  console.log("non-organizer:", refused);
  const ok = refused === "Only an organizer can link a player.";
  console.log(ok ? "\n0149 applied and verified." : "\nWRONG");
  await sql.end();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
