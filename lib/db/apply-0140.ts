/**
 * Apply 0140 — a drafted player is listed under their drafted name — and put
 * the names already saved in lineups right.
 *
 *   npx tsx lib/db/apply-0140.ts
 *
 * Safe to re-run: create or replace, and the name repair only touches rows
 * that still differ.
 *
 * Verified by comparing every public league's player list before and after:
 * the ONLY names allowed to change are drafted players whose account carries a
 * different name. Anything else moving means the function changed more than
 * it should have.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function snapshot() {
  const rows = await sql`
    select c.id as comp, p.team_id, p.user_id, p.name
      from competitions c,
           lateral public.competition_player_names(c.id) p
     where c.visibility = 'public'`;
  return new Map(
    rows.map((r) => [
      `${r.comp}|${r.team_id}|${r.user_id ?? r.name}`,
      r.name as string,
    ]),
  );
}

async function main() {
  const before = await snapshot();

  const statements = readFileSync(
    "lib/db/migrations/0140_drafted_name_over_account_name.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const after = await snapshot();
  const expected = new Set(
    (
      await sql`
        select distinct f.competition_id || '|' || f.placed_team_id || '|' || f.user_id as k
          from free_agents f join users u on u.id = f.user_id
         where f.placed_team_id is not null and f.status <> 'withdrawn'
           and btrim(f.name) <> '' and btrim(f.name) <> coalesce(btrim(u.display_name), '')`
    ).map((r) => r.k as string),
  );
  let changed = 0;
  let unexpected = 0;
  for (const [k, name] of after) {
    const was = before.get(k);
    if (was === name) continue;
    changed += 1;
    const ok = expected.has(k);
    if (!ok) unexpected += 1;
    console.log(
      `  ${ok ? "ok      " : "WRONG   "} ${was ?? "(absent)"} → ${name}`,
    );
  }
  if (before.size !== after.size) {
    console.log(`  WRONG    row count ${before.size} → ${after.size}`);
    unexpected += 1;
  }
  console.log(`  ${changed} public names changed, ${unexpected} unexpected`);
  if (unexpected > 0) process.exit(1);

  // The lineups already saved under an account name.
  for (const table of ["match_appearances", "match_absences"]) {
    const r = await sql`
      update ${sql(table)} x set player_name = btrim(f.name)
        from free_agents f
       where f.competition_id = x.competition_id and f.user_id = x.user_id
         and f.placed_team_id = x.team_id and btrim(f.name) <> ''
         and x.player_name <> btrim(f.name)`;
    console.log(`  renamed ${r.count} ${table} rows to the drafted name`);
  }

  console.log("\n0140 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
