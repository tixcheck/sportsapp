/**
 * Apply 0157 — ladder_round_weeks, ladder_draw 'bvl_round', ladder_tier_nights.
 *
 *   npx tsx lib/db/apply-0157.ts
 *
 * Safe to re-run. Changes no league's behaviour: every existing ladder keeps
 * ladder_round_weeks = 1 and its own ladder_draw.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0157_bvl_rounds.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  const [s] = await sql`
    select count(*) filter (where ladder_round_weeks <> 1)::int changed, count(*)::int total
      from league_settings`;
  const [t] =
    await sql`select relrowsecurity rls from pg_class where relname = 'ladder_tier_nights'`;
  const [chk] = await sql`
    select pg_get_constraintdef(oid) d from pg_constraint where conname = 'league_settings_ladder_draw_check'`;
  console.log({
    leaguesWithRoundsChanged: s.changed,
    of: s.total,
    rls: t.rls,
    drawCheck: chk.d,
  });
  const ok = s.changed === 0 && t.rls && chk.d.includes("bvl_round");
  console.log(ok ? "\n0157 applied and verified." : "\nWRONG");
  await sql.end();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
