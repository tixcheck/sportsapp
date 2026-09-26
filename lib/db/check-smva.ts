/**
 * What SMVA looks like in the database right now.
 *
 *   npx tsx lib/db/check-smva.ts
 *
 * READ-ONLY, and deliberately run before anything is deleted. Removing a team
 * cascades: its payments go, and where a schedule exists the league's matches
 * and pools go with it. So the question that decides whether a bulk replace is
 * safe is "has anything been played yet", and that has to be answered from the
 * database, not assumed from the fact that the season opener is still ahead.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const orgs = await sql`
    select id, name, slug from organizations
     where name ilike '%scarborough%' or name ilike '%smva%'
        or slug ilike '%smva%' or slug ilike '%scarborough%'`;

  if (orgs.length === 0) {
    console.log("No Scarborough / SMVA organization found.");
    await sql.end();
    return;
  }

  for (const org of orgs) {
    console.log(`\n=== ${org.name}  (${org.slug}) ===`);

    const venues = await sql`
      select id, name, courts from venues where org_id = ${org.id}
       order by name`;
    console.log(`\n  venues (${venues.length}):`);
    for (const v of venues) {
      console.log(
        `      ${String(v.name).padEnd(34)} courts=${v.courts ?? "—"}`,
      );
    }

    const comps = await sql`
      select id, name, slug, type::text as type, status::text as status,
             start_date
        from competitions where org_id = ${org.id}
       order by start_date desc nulls last`;

    for (const c of comps) {
      console.log(`\n  --- ${c.name}  [${c.type}/${c.status}] ---`);
      console.log(`      id=${c.id}  slug=${c.slug}  start=${c.start_date}`);

      const [ls] = await sql`
        select * from league_settings where competition_id = ${c.id}`;
      if (ls) {
        console.log(
          `      ladder=${ls.ladder_enabled} unit=${ls.ladder_unit} target=${ls.ladder_target}` +
            ` swaps=${JSON.stringify(ls.ladder_swaps)} scoring=${ls.ladder_scoring}`,
        );
      }

      const divs = await sql`
        select * from divisions where competition_id = ${c.id}`;
      if (divs.length > 0) {
        console.log(
          `      division columns: ${Object.keys(divs[0]).join(", ")}`,
        );
      }

      for (const d of divs) {
        const teams = await sql`
          select id, name, status::text as status
            from teams
           where competition_id = ${c.id} and division_id = ${d.id}
           order by name`;
        const venueName = venues.find((v) => v.id === d.venue_id)?.name ?? "—";
        console.log(
          `\n      TIER "${d.name}"  venue=${venueName}  teams=${teams.length}`,
        );
        for (const t of teams) {
          console.log(`          ${String(t.name).padEnd(30)} ${t.status}`);
        }
      }

      const loose = await sql`
        select id, name, status::text as status from teams
         where competition_id = ${c.id} and division_id is null
         order by name`;
      if (loose.length > 0) {
        console.log(`\n      NO TIER (${loose.length}):`);
        for (const t of loose) {
          console.log(`          ${String(t.name).padEnd(30)} ${t.status}`);
        }
      }

      // The question that decides whether a bulk delete is safe.
      const [counts] = await sql`
        select
          (select count(*) from matches m where m.competition_id = ${c.id})::int
            as matches,
          (select count(*) from matches m
            where m.competition_id = ${c.id} and m.status = 'completed')::int
            as completed,
          (select count(*) from sets s
             join matches m on m.id = s.match_id
            where m.competition_id = ${c.id})::int as sets,
          (select count(*) from team_members tm
             join teams t on t.id = tm.team_id
            where t.competition_id = ${c.id})::int as members,
          (select count(*) from registration_payments p
            where p.competition_id = ${c.id})::int as payments`;
      console.log(
        `\n      matches=${counts.matches} completed=${counts.completed}` +
          ` sets=${counts.sets} roster_rows=${counts.members}` +
          ` payments=${counts.payments}`,
      );
      if (counts.sets > 0 || counts.completed > 0) {
        console.log(
          `      *** RESULTS EXIST — deleting teams would destroy them ***`,
        );
      }
    }
  }

  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
