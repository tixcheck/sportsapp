/**
 * Apply 0131 — adopting a sign-up joins the roster too.
 *
 *   npx tsx lib/db/apply-0131.ts
 *
 * Safe to re-run: `create or replace` plus re-issued grants.
 *
 * This only fixes the function. People already stranded are repaired by
 * `lib/db/backfill-0131-claim.ts`, which is deliberately separate: it changes
 * who can see what, and that deserves its own run and its own output.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0131_claim_creates_roster_row.sql",
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
     where n.nspname = 'public' and p.proname = 'claim_free_agent_signups'`;
  if (!fn) {
    console.error("  MISSING  claim_free_agent_signups");
    process.exit(1);
  }
  const def = String(fn.def);

  // The fix itself.
  const insertsMember = /insert into team_members/.test(def);
  console.log(
    insertsMember
      ? "  ok       adopting a placed sign-up joins the roster"
      : "  WRONG    function still only links free_agents",
  );
  if (!insertsMember) process.exit(1);

  // Being drafted is not a claim to run the team.
  const neverCaptain = !/'captain'/.test(def);
  console.log(
    neverCaptain
      ? "  ok       joins as 'player', never 'captain'"
      : "  WRONG    function can grant captaincy",
  );
  if (!neverCaptain) process.exit(1);

  console.log(
    fn.prosecdef
      ? "  ok       security definer"
      : "  WRONG    not security definer",
  );
  if (!fn.prosecdef) process.exit(1);

  const [g] = await sql`
    select has_function_privilege(
      'authenticated', 'public.claim_free_agent_signups()', 'execute'
    ) as ok`;
  console.log(g.ok ? "  ok       execute granted" : "  MISSING  execute grant");
  if (!g.ok) process.exit(1);

  // How many people this will help the next time they load a dashboard.
  const [pending] = await sql`
    select count(*)::int as n
      from free_agents f
      join users u on lower(btrim(u.email)) = lower(btrim(f.email))
     where f.user_id is null`;
  console.log(
    `  ${pending.n} pool rows match an existing account and are unlinked`,
  );

  console.log("\n0131 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
