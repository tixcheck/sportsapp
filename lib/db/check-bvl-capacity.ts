/**
 * BVL individual sign-up capacity — what it is right now.
 *
 *   npx tsx lib/db/check-bvl-capacity.ts
 *
 * READ-ONLY. "Open up 6 more spots" is a RELATIVE instruction, so the current
 * value has to be on screen before anything is changed. An identical request
 * earlier in this league's history had already been applied once, and applying
 * it twice would have quietly doubled it.
 *
 * The field is `competitions.max_individual_signups` (0105), NOT the team cap:
 * `register_individual` deliberately ignores `max_teams`, so raising that would
 * change nothing a free agent ever hits.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const rows = await sql`
    select c.id, c.name, c.status::text as status,
           c.allow_individual_signups as takes_individuals,
           c.max_individual_signups as cap,
           ls.max_teams as team_cap,
           (select count(*) from free_agents f
             where f.competition_id = c.id and f.status <> 'withdrawn')::int
             as signed_up,
           (select count(*) from free_agents f
             where f.competition_id = c.id and f.status = 'withdrawn')::int
             as withdrawn,
           -- Entrants, by the same rule register_team counts: a withdrawn team
           -- has given its spot back and must not hold one.
           (select count(*) from teams t
             where t.competition_id = c.id and t.status <> 'withdrawn')::int
             as teams,
           (select count(*) from teams t
             where t.competition_id = c.id and t.status = 'withdrawn')::int
             as teams_withdrawn
      from competitions c
      join organizations o on o.id = c.org_id
      left join league_settings ls on ls.competition_id = c.id
     where o.name ilike '%brampton%'
     order by c.name`;

  console.log("Brampton Volleyball League — individual sign-up capacity\n");
  for (const r of rows) {
    const cap = r.cap === null ? "uncapped" : String(r.cap);
    const left =
      r.cap === null ? "—" : String(Math.max(0, Number(r.cap) - r.signed_up));
    console.log(`  ${r.name}`);
    console.log(
      `      id=${String(r.id).slice(0, 8)}  status=${r.status}` +
        `  takes_individuals=${r.takes_individuals}`,
    );
    const teamCap = r.team_cap === null ? "uncapped" : String(r.team_cap);
    const teamLeft =
      r.team_cap === null
        ? "—"
        : String(Math.max(0, Number(r.team_cap) - r.teams));
    console.log(
      `      TEAMS       cap=${teamCap}  registered=${r.teams}` +
        `  spots_left=${teamLeft}  (withdrawn ${r.teams_withdrawn}, not counted)`,
    );
    console.log(
      `      INDIVIDUALS cap=${cap}  signed_up=${r.signed_up}` +
        `  spots_left=${left}  (withdrawn ${r.withdrawn}, not counted)\n`,
    );
  }

  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
