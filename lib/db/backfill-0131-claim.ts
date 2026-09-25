/**
 * Link pool sign-ups to the accounts that already exist, and join the rosters.
 *
 *   npx tsx lib/db/backfill-0131-claim.ts          # report only
 *   npx tsx lib/db/backfill-0131-claim.ts --write  # make the changes
 *
 * `claim_free_agent_signups()` only ever runs for whoever is signed in, so it
 * repairs somebody the next time THEY load a dashboard. These people are
 * already stranded — Big Shoots had six with accounts, five of them placed on a
 * team and still seeing "ask your organizer to add you to a team" — and they
 * should not have to log in again to be found.
 *
 * Applies exactly the rule the function applies, row by row:
 *   - the email must match an existing account, case- and space-insensitively
 *   - SKIP if that account already has its own sign-up in that competition
 *     (free_agents_one_per_user is unique (competition_id, user_id))
 *   - join the roster as 'player' when the sign-up is placed, never 'captain'
 *
 * Read-only unless --write is passed. Emails are masked.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const WRITE = process.argv.includes("--write");

const mask = (e: string | null) =>
  !e ? "(none)" : e.replace(/^(.).*?(@.*)$/, "$1***$2");

async function main() {
  const candidates = await sql`
    select f.id, f.competition_id, f.name, f.email, f.placed_team_id,
           u.id as user_id,
           c.name as competition_name
      from free_agents f
      join users u on lower(btrim(u.email)) = lower(btrim(f.email))
      join competitions c on c.id = f.competition_id
     where f.user_id is null
     order by c.name, f.name`;

  console.log(
    `${candidates.length} unlinked sign-ups whose email matches an account\n`,
  );

  let linked = 0;
  let rostered = 0;
  let skipped = 0;

  for (const row of candidates) {
    const [clash] = await sql`
      select 1 as x from free_agents
       where competition_id = ${row.competition_id}
         and user_id = ${row.user_id}
       limit 1`;
    if (clash) {
      skipped += 1;
      console.log(
        `  SKIP  ${row.name}  ${mask(row.email)}  — already has their own sign-up in ${row.competition_name}`,
      );
      continue;
    }

    const needsRoster = row.placed_team_id !== null;
    console.log(
      `  ${WRITE ? "LINK" : "would"}  ${row.name}  ${mask(row.email)}  ${row.competition_name}${needsRoster ? "  + roster row" : "  (not placed — nothing to join)"}`,
    );

    if (WRITE) {
      await sql.begin(async (tx) => {
        await tx`
          update free_agents set user_id = ${row.user_id}, updated_at = now()
           where id = ${row.id}`;
        if (needsRoster) {
          await tx`
            insert into team_members (team_id, user_id, role)
            values (${row.placed_team_id}, ${row.user_id}, 'player')
            on conflict (team_id, user_id) do nothing`;
        }
      });
    }
    linked += 1;
    if (needsRoster) rostered += 1;
  }

  console.log(
    `\n${WRITE ? "linked" : "would link"} ${linked}, ${WRITE ? "joined" : "would join"} ${rostered} rosters, skipped ${skipped}`,
  );
  if (!WRITE) console.log("\nnothing written — re-run with --write");

  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
