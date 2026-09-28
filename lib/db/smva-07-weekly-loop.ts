/**
 * SMVA step 7 — put week 1 on the footing the weekly loop runs on.
 *
 *   npx tsx lib/db/smva-07-weekly-loop.ts            # report only
 *   npx tsx lib/db/smva-07-weekly-loop.ts --write    # apply
 *
 * Step 5 wrote opening night with `matches.round` = the SLOT within the night
 * (1–7). Everything in the ladder — draw, lock, undo, the organizer's panel —
 * reads `round` as the WEEK, the same numbering as `ladder_placements.week`.
 * Left alone, locking "week 1" would have read only the 19 first-slot games,
 * from every gym, as the whole week. So every one of the 93 becomes round 1;
 * the slot is already carried by `scheduled_at`, which is what the gym package
 * now reads it from.
 *
 * And the ladder had no placements at all, so the panel said it hadn't
 * started. Week 1's placements are written from the seeds step 4 loaded from
 * the published schedule — the same order the grids were bound in, so the
 * placements describe exactly the night that is already scheduled.
 *
 * Refuses if any placement already exists. Nothing else is touched.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const write = process.argv.includes("--write");

const SLUG = "smva-monday-ladder-2026-2027";

async function main() {
  const [comp] = await sql`
    select id, name from competitions where slug = ${SLUG}`;
  if (!comp) throw new Error(`no league with slug "${SLUG}"`);
  console.log(comp.name);

  const [placed] = await sql`
    select count(*)::int as n from ladder_placements
     where competition_id = ${comp.id}`;
  if (placed.n > 0) {
    console.error(`  REFUSED: ${placed.n} placements already exist.`);
    process.exit(1);
  }

  const rounds = await sql`
    select round, count(*)::int as n,
           count(distinct (scheduled_at at time zone 'America/Toronto')::date)::int as nights
      from matches where competition_id = ${comp.id}
     group by round order by round`;
  const total = rounds.reduce((n, r) => n + (r.n as number), 0);
  const nights = new Set(
    (
      await sql`
        select distinct (scheduled_at at time zone 'America/Toronto')::date::text as d
          from matches where competition_id = ${comp.id}`
    ).map((r) => r.d as string),
  );
  console.log(
    `  matches: ${total} across rounds ${rounds.map((r) => `${r.round}:${r.n}`).join(" ")}`,
  );
  console.log(`  nights:  ${[...nights].join(", ")}`);
  // Only ever one night has been scheduled; if that has changed, stop — this
  // renumbering is only right for a single night.
  if (nights.size !== 1 || total !== 93) {
    console.error("  REFUSED: expected exactly one night of 93 matches.");
    process.exit(1);
  }

  const divs = await sql`
    select id, name from divisions
     where competition_id = ${comp.id} order by tier_order`;
  const rows: { team: string; division: string; position: number }[] = [];
  for (const d of divs) {
    const teams = await sql`
      select id, name, seed from teams
       where division_id = ${d.id} order by seed, name`;
    if (teams.some((t) => t.seed == null)) {
      throw new Error(`${d.name}: a team has no seed`);
    }
    teams.forEach((t, i) =>
      rows.push({
        team: t.id as string,
        division: d.id as string,
        position: i,
      }),
    );
    console.log(
      `  ${String(d.name).padEnd(22)} ${teams.map((t) => t.name).join(" · ")}`,
    );
  }
  console.log(`\n  ${rows.length} week-1 placements to write`);

  if (!write) {
    console.log("\n  nothing written — pass --write to apply");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    await tx`update matches set round = 1 where competition_id = ${comp.id}`;
    for (const r of rows) {
      await tx`
        insert into ladder_placements
          (competition_id, team_id, division_id, week, position)
        values (${comp.id}, ${r.team}, ${r.division}, 1, ${r.position})`;
    }
  });

  const [after] = await sql`
    select
      (select count(*)::int from matches
        where competition_id = ${comp.id} and round = 1) as week1,
      (select count(*)::int from matches
        where competition_id = ${comp.id}) as all_matches,
      (select count(*)::int from ladder_placements
        where competition_id = ${comp.id} and week = 1) as placements`;
  // Every placement's tier must be the tier its games are recorded in.
  const [{ strays }] = await sql`
    select count(*)::int as strays from matches m
      join ladder_placements p
        on p.team_id in (m.home_team_id, m.away_team_id) and p.week = 1
     where m.competition_id = ${comp.id} and p.division_id <> m.division_id`;

  const ok =
    after.week1 === 93 &&
    after.all_matches === 93 &&
    after.placements === rows.length &&
    strays === 0;
  console.log(
    `\n  ${after.week1}/${after.all_matches} matches in week 1 · ` +
      `${after.placements} placements · ${strays} placed in a tier they don't play in`,
  );
  console.log(ok ? "  ok  week 1 is on the weekly loop" : "  WRONG");
  if (!ok) process.exit(1);
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
