/**
 * Apply 0148 — a waiver signature counts across the org's competitions.
 *
 *   npx tsx lib/db/apply-0148.ts
 *
 * Safe to re-run: `create or replace` only. After applying, re-syncs every
 * team in a competition that requires a waiver, because a rule change doesn't
 * move existing teams on its own (the triggers fire on signatures and roster
 * changes) — and reports which teams that released.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0148_waiver_signed_once_per_org.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const before = await sql`
    select t.id, t.name, c.name as comp from teams t join competitions c on c.id = t.competition_id
     where t.status = 'pending_waiver'`;

  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const teams = await sql`
    select t.id from teams t join competitions c on c.id = t.competition_id
     where c.waiver_id is not null and t.status not in ('withdrawn', 'pending_payment')`;
  for (const t of teams)
    await sql`select public.sync_team_entry_status(${t.id})`;

  const stillHeld = new Set(
    (await sql`select id from teams where status = 'pending_waiver'`).map(
      (r) => r.id as string,
    ),
  );
  const released = before.filter((t) => !stillHeld.has(t.id as string));
  console.log(`re-synced ${teams.length} teams; released ${released.length}:`);
  for (const t of released) console.log(`  ${t.comp} — ${t.name}`);
  console.log(`still held for a signature: ${stillHeld.size}`);
  console.log("\n0148 applied.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
