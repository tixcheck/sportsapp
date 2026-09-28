/**
 * Apply 0139 — linking an account carries a player's earlier games with it.
 *
 *   npx tsx lib/db/apply-0139.ts
 *
 * Safe to re-run: create or replace, and the trigger is dropped and recreated.
 *
 * Verified by REHEARSAL on Big Shoots inside a rolled-back transaction, not by
 * "the trigger exists": a drafted player is un-linked, given name-only games
 * (one of them ALSO recorded under their account, the collision case) and a
 * name-only missed night, then linked again — and every one of those rows must
 * end up on the account, once.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0139_link_account_carries_appearances.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const [trg] = await sql`
    select tgenabled from pg_trigger where tgname = 'free_agents_carry_appearances'`;
  console.log(trg ? "  ok       trigger installed" : "  MISSING  trigger");
  if (!trg) process.exit(1);

  const [fa] = await sql`
    select f.id, f.name, f.user_id, f.competition_id, f.placed_team_id
      from free_agents f
      join competitions c on c.id = f.competition_id
     where c.name ilike 'Big Shoots%' and f.user_id is not null and f.placed_team_id is not null
     order by f.name limit 1`;
  const games = await sql`
    select id from matches
     where competition_id = ${fa.competition_id}
       and ${fa.placed_team_id} in (home_team_id, away_team_id)
       and not exists (select 1 from match_appearances a where a.match_id = matches.id)
     order by scheduled_at limit 3`;
  if (games.length < 3)
    throw new Error("need three unplayed games to rehearse on");
  const [g1, g2, g3] = games.map((g) => g.id as string);
  console.log(`\n  rehearsing on ${fa.name}`);

  let report = "";
  await sql
    .begin(async (tx) => {
      await tx`update free_agents set user_id = null where id = ${fa.id}`;
      // Spacing and case differ on purpose: the match must ignore both.
      const loose = `  ${String(fa.name).toUpperCase().replace(" ", "   ")} `;
      for (const m of [g1, g2]) {
        await tx`insert into match_appearances (competition_id, match_id, team_id, user_id, player_name, role)
                 values (${fa.competition_id}, ${m}, ${fa.placed_team_id}, null, ${loose}, 'rostered')`;
      }
      // g2 is ALSO recorded under the account: the collision case.
      await tx`insert into match_appearances (competition_id, match_id, team_id, user_id, player_name, role)
               values (${fa.competition_id}, ${g2}, ${fa.placed_team_id}, ${fa.user_id}, ${fa.name}, 'rostered')`;
      await tx`insert into match_absences (competition_id, match_id, team_id, user_id, player_name)
               values (${fa.competition_id}, ${g3}, ${fa.placed_team_id}, null, ${loose})`;

      await tx`update free_agents set user_id = ${fa.user_id} where id = ${fa.id}`;

      const apps = await tx`
        select match_id, user_id from match_appearances where match_id in (${g1}, ${g2})`;
      const abs =
        await tx`select user_id from match_absences where match_id = ${g3}`;
      const allLinked =
        apps.every((a) => a.user_id === fa.user_id) &&
        abs.every((a) => a.user_id === fa.user_id);
      const onceEach =
        apps.filter((a) => a.match_id === g1).length === 1 &&
        apps.filter((a) => a.match_id === g2).length === 1;
      report =
        `  ${allLinked ? "ok      " : "WRONG   "} every name-only row moved onto the account\n` +
        `  ${onceEach ? "ok      " : "WRONG   "} recorded both ways in one game → one row, not two\n` +
        `  ${abs.length === 1 ? "ok      " : "WRONG   "} the missed night moved too`;
      if (!allLinked || !onceEach || abs.length !== 1)
        throw new Error(`VERIFY FAILED\n${report}`);
      throw new Error("rollback");
    })
    .catch((e: Error) => {
      if (e.message !== "rollback") {
        console.error(e.message);
        process.exit(1);
      }
    });

  console.log(report);
  console.log("\n  (rehearsal rolled back — live data untouched)");
  console.log("\n0139 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
