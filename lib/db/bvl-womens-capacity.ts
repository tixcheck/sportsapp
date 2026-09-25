/**
 * Open 6 more team spots on BVL's Women's Wednesday league.
 *
 *   npx tsx lib/db/bvl-womens-capacity.ts            # report only
 *   npx tsx lib/db/bvl-womens-capacity.ts --write    # apply
 *
 * Vee, 2026-09-25: "can you open up 6 more spots for Women's Wednesdays please?"
 *
 * TEAM spots, not individual sign-ups. The Wednesday league is at 22 of 22
 * teams with nobody able to register, while its individual pool has 9 of 16
 * free — a request for more room can only be about the one that is full. The
 * same word meant team spots the last two times BVL asked: Non-Spiking Tuesday
 * reads 28 and Spiking Thursday 50, which are the earlier 23+5 and 45+5.
 *
 * Written as targeted SQL rather than through the league edit form ON PURPOSE:
 * `editLeagueSchema.courtList` strips `venueId` (a known, unfixed data-loss
 * bug) and BVL is the org with custom courts. Saving that form to change one
 * integer could take their court assignments with it.
 *
 * GUARDED so a second run cannot double-apply — the failure mode that nearly
 * happened when an identical "+5" had already been made earlier the same day.
 * It moves 22 -> 28 and nothing else; any other current value is refused rather
 * than guessed at.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const COMPETITION = "85a0817c";
const FROM = 22;
const TO = 28;

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const write = process.argv.includes("--write");

async function main() {
  const [row] = await sql`
    select c.id, c.name, ls.max_teams,
           (select count(*) from teams t
             where t.competition_id = c.id and t.status <> 'withdrawn')::int
             as registered
      from competitions c
      join league_settings ls on ls.competition_id = c.id
     where c.id::text like ${COMPETITION + "%"}`;

  if (!row) {
    console.error(`FAILED: no league matching ${COMPETITION}`);
    process.exit(1);
  }

  console.log(`${row.name}`);
  console.log(`  max_teams ${row.max_teams} · registered ${row.registered}\n`);

  if (row.max_teams === TO) {
    console.log(`  already at ${TO} — nothing to do (re-run is a no-op)`);
    await sql.end();
    return;
  }

  if (row.max_teams !== FROM) {
    console.error(
      `  REFUSED: expected ${FROM} before adding 6, found ${row.max_teams}.` +
        `\n  Somebody has changed this since it was checked. Re-read before writing.`,
    );
    process.exit(1);
  }

  if (!write) {
    console.log(`  would set max_teams ${FROM} -> ${TO}  (pass --write)`);
    await sql.end();
    return;
  }

  const updated = await sql`
    update league_settings
       set max_teams = ${TO}
     where competition_id = ${row.id}
       and max_teams = ${FROM}
    returning max_teams`;

  if (updated.length !== 1) {
    console.error("  FAILED: no row updated — the value changed underneath us");
    process.exit(1);
  }

  const [after] = await sql`
    select ls.max_teams,
           (select count(*) from teams t
             where t.competition_id = ${row.id} and t.status <> 'withdrawn')::int
             as registered
      from league_settings ls where ls.competition_id = ${row.id}`;

  console.log(`  max_teams ${FROM} -> ${after.max_teams}`);
  console.log(
    `  registered ${after.registered} · ${after.max_teams - after.registered} spots now open`,
  );

  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
