/**
 * Apply 0159 — sync_draft_rosters, appearances_from_roster + its trigger.
 *
 *   npx tsx lib/db/apply-0159.ts
 *
 * Safe to re-run. Changes no league: the new column defaults to false and the
 * sync only runs when an organizer saves a draft. After applying, it rehearses
 * both on Mango Friday Mens as one of its organizers inside a transaction that
 * is ROLLED BACK, and prints what they would do.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const FRIDAY = "ed052851-387e-443f-9cb8-1b91f8291b24";

class Rollback extends Error {}

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0159_draft_rosters_and_roster_lineups.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  const [c] = await sql`
    select count(*) filter (where appearances_from_roster)::int on_ from competitions`;
  const [t] = await sql`
    select count(*)::int n from pg_trigger where tgname = 'matches_fill_roster_appearances'`;
  console.log({ leaguesWithRosterLineups: c.on_, trigger: t.n === 1 });

  // Rehearsal, rolled back.
  const [organizer] = await sql`
    select m.user_id from competitions c
      join org_members m on m.org_id = c.org_id and m.role = 'admin'
     where c.id = ${FRIDAY} limit 1`;
  if (!organizer) {
    console.log("(no organizer found to rehearse as — skipped)");
  } else {
    try {
      await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: organizer.user_id, role: "authenticated" })}, true)`;
        await tx`select set_config('request.jwt.claim.sub', ${organizer.user_id}, true)`;
        await tx`set local role authenticated`;
        const [adm] =
          await tx`select public.is_competition_admin(${FRIDAY}) ok`;
        console.log("rehearsing as the league's organizer:", adm.ok);
        const [r] = await tx`select public.sync_draft_rosters(${FRIDAY}) r`;
        console.log("\nRehearsal — draft sync on Friday:", JSON.stringify(r.r));
        const rows = await tx`
          select t.name team, string_agg(coalesce(fa.name, u.display_name), ', ' order by 1) players
            from team_members tm join teams t on t.id = tm.team_id
            left join users u on u.id = tm.user_id
            left join free_agents fa on fa.competition_id = t.competition_id and fa.user_id = tm.user_id
           where t.competition_id = ${FRIDAY} group by t.name order by t.name`;
        for (const x of rows) console.log(`  ${x.team}: ${x.players}`);
        await tx`reset role`;
        await tx`update competitions set appearances_from_roster = true where id = ${FRIDAY}`;
        const [m] =
          await tx`select id from matches where competition_id = ${FRIDAY} order by scheduled_at desc limit 1`;
        await tx`update matches set status = 'scheduled' where id = ${m.id}`;
        await tx`delete from match_appearances where match_id = ${m.id}`;
        await tx`update matches set status = 'completed' where id = ${m.id}`;
        const apps = await tx`
          select t.name team, string_agg(a.player_name, ', ' order by a.player_name) who
            from match_appearances a join teams t on t.id = a.team_id
           where a.match_id = ${m.id} group by t.name order by t.name`;
        console.log("\nRehearsal — completing a game records its lineup:");
        for (const x of apps) console.log(`  ${x.team}: ${x.who}`);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
      console.log("\n(rehearsal rolled back — nothing changed)");
    }
  }
  console.log("\n0159 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
