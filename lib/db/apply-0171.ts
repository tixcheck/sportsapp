/**
 * Apply 0171 — ladder weeks lock and draw themselves overnight.
 *
 *   npx tsx lib/db/apply-0171.ts
 *
 * Adds league_settings.ladder_auto_advance (default on) and switches it OFF
 * for BVL's two round leagues: Round 2's gym plan (each tier keeps its Round 1
 * gym, Big Dig Energy fixed at St. Thomas Aquinas) isn't in the draw yet, and
 * BVL hasn't said how a tied tier is broken. Their organizers lock by hand
 * until both are settled. Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0171_ladder_auto_advance.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
    const off = await tx`
      update league_settings s set ladder_auto_advance = false
        from competitions c join organizations o on o.id = c.org_id
       where s.competition_id = c.id
         and o.name = 'Brampton Volleyball League'
         and s.ladder_draw = 'bvl_round'
      returning c.name`;
    console.log(
      "off for:",
      off.map((r) => r.name),
    );
  });
  const rows = await sql`
    select c.name, s.ladder_auto_advance auto
      from league_settings s join competitions c on c.id = s.competition_id
     where s.ladder_enabled order by c.name`;
  for (const r of rows) console.log(`  ${r.auto ? "on " : "off"}  ${r.name}`);
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
