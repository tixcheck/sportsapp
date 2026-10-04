/**
 * SMVA step 9 — week 2 (Mon 5 Oct 2026) from the organizer's published order.
 *
 *   npx tsx lib/db/smva-09-week2-from-sheet.ts            # report only
 *   npx tsx lib/db/smva-09-week2-from-sheet.ts --write    # apply + draw
 *
 * SMVA published week 2's order on smva.ca (last updated 2026-10-04). Week 1
 * could not be locked in the app — Porter was never ranked (LOGAN played there
 * but wasn't a team here) and OG, Zeus and Team 39 played nowhere — so the
 * organizer's sheet is the record, exactly as the signed gym sheets were for
 * week 1 (smva-08). This does what `lockLadderWeekAction` would have done from
 * a complete week 1, and then what `drawLadderWeekAction` does for a pod-grid
 * ladder:
 *
 *   1. LOGAN becomes a team (it moves up to PPL on the sheet).
 *   2. Week-2 placements are written in the sheet's seat order (A, B, C…), and
 *      each placed team's `division_id` moves to its week-2 tier.
 *   3. Week 2 is drawn on the pinned grids, on the next playing Monday after
 *      week 1 — `planPodNight`, the same planner the app's draw uses.
 *
 * Not placed, so they don't play: OG, ZEUS, Team 39 and TORONTO WARRIORS — the
 * sheet leaves them out. Nobody is withdrawn or deleted; that is the
 * organizer's call. The sheet's placeholders ("New team" in Porter F, "empty
 * for now" in King F) are not teams, so those tiers play as five.
 *
 * Checked against week 1's results: every tier's ups and downs match the
 * 2-up/2-down rule, with one exception taken as the organizer wrote it — King
 * lists KILLER HITMEN above SCREAMING EAGLES though Eagles finished higher.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { DateTime } from "luxon";

import { planPodNight, nextPlayingNight } from "@/lib/scheduler/pod-night";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const WRITE = process.argv.includes("--write");
const SLUG = "smva-monday-ladder-2026-2027";
const WEEK = 2;

/** The sheet, gym by gym, seats in order (index 0 = A). */
const SHEET: { tier: string; seats: string[] }[] = [
  {
    tier: "Tier 1 — Bethune",
    seats: [
      "EMPIRE SPIKES BACK",
      "MESLA CONSTRUCTION",
      "DAZED AND CONFUSED",
      "VOID",
      "CONNEX",
      "HYDRATION NATION",
    ],
  },
  {
    tier: "Tier 2 — Leacock",
    seats: [
      "ONE PUNCH",
      "JUMBO SHRIMP",
      "INVICTUS",
      "SVEIKS",
      "BIG D BOYS",
      "BRONIN",
    ],
  },
  {
    tier: "Tier 3 — Agincourt",
    seats: [
      "THE FACTORY",
      "MISFITS",
      "BANGERS AND SMASH",
      "TRUE NORTH VOLLEYBALL",
      "UNITED",
      "TRAFFIC",
    ],
  },
  { tier: "Tier 4 — PPL", seats: ["SUNDAY KNIGHTS", "BEERS", "LOGAN", "KATZ"] },
  {
    tier: "Tier 5 — Porter",
    seats: ["OUTTAHAND", "SMASHED", "CHEFS", "INSIDERS", "GIANT CROWS"],
  },
  {
    tier: "Tier 6 — Wexford",
    seats: ["BOUNCETOWN", "B.O.M.B.", "BIG DIG ENERGY", "Blok Choy"],
  },
  {
    tier: "Tier 7 — King",
    seats: [
      "TGS",
      "DEATH FROM ABOVE",
      "COBRAS",
      "KILLER HITMEN",
      "SCREAMING EAGLES",
    ],
  },
];

async function main() {
  const [comp] = await sql`
    select c.id, c.timezone, ls.blackout_dates, ls.ladder_draw
      from competitions c join league_settings ls on ls.competition_id = c.id
     where c.slug = ${SLUG}`;
  if (comp.ladder_draw !== "pod_grid") throw new Error("not a pod-grid ladder");
  const zone = (comp.timezone as string) ?? "America/Toronto";

  const [already] = await sql`
    select count(*)::int as n from ladder_placements
     where competition_id = ${comp.id} and week >= ${WEEK}`;
  if (already.n > 0) throw new Error(`week ${WEEK} already has placements`);
  const [drawn] = await sql`
    select count(*)::int as n from matches where competition_id = ${comp.id} and round = ${WEEK}`;
  if (drawn.n > 0) throw new Error(`week ${WEEK} already has matches`);

  const divs = await sql`
    select id, name, venue_id from divisions where competition_id = ${comp.id}`;
  const div = new Map(divs.map((d) => [d.name as string, d]));
  const teams =
    await sql`select id, name from teams where competition_id = ${comp.id}`;
  const teamId = new Map(teams.map((t) => [t.name as string, t.id as string]));

  const seen = new Set<string>();
  for (const g of SHEET) {
    if (!div.has(g.tier)) throw new Error(`no tier "${g.tier}"`);
    for (const n of g.seats) {
      if (seen.has(n)) throw new Error(`${n} seated twice`);
      seen.add(n);
      if (!teamId.has(n) && n !== "LOGAN") throw new Error(`no team "${n}"`);
    }
    console.log(
      `${g.tier}: ${g.seats.map((n, i) => `${"ABCDEFG"[i]} ${n}`).join(" · ")}`,
    );
  }
  const left = teams.map((t) => t.name as string).filter((n) => !seen.has(n));
  console.log(`\nnot placed in week ${WEEK}: ${left.join(", ")}`);

  const [last] = await sql`
    select max(scheduled_at) as at from matches
     where competition_id = ${comp.id} and round = ${WEEK - 1}`;
  const lastNight = DateTime.fromJSDate(last.at as Date, { zone }).toISODate()!;
  const night = nextPlayingNight(
    lastNight,
    (comp.blackout_dates as string[] | null) ?? [],
  );
  console.log(`week ${WEEK - 1} was ${lastNight}; week ${WEEK} plays ${night}`);

  if (!WRITE) {
    console.log("\nnothing written — pass --write to apply and draw");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    if (!teamId.has("LOGAN")) {
      const [t] = await tx`
        insert into teams (competition_id, name, status, division_id)
        values (${comp.id}, 'LOGAN', 'active', ${div.get("Tier 4 — PPL")!.id})
        returning id`;
      teamId.set("LOGAN", t.id as string);
    }

    const rosters: {
      divisionId: string;
      venueId: string | null;
      teamIds: string[];
    }[] = [];
    for (const g of SHEET) {
      const d = div.get(g.tier)!;
      const ids = g.seats.map((n) => teamId.get(n)!);
      for (const [pos, id] of ids.entries()) {
        await tx`
          insert into ladder_placements (competition_id, team_id, division_id, week, position)
          values (${comp.id}, ${id}, ${d.id}, ${WEEK}, ${pos})`;
        await tx`update teams set division_id = ${d.id} where id = ${id}`;
      }
      rosters.push({
        divisionId: d.id as string,
        venueId: (d.venue_id as string | null) ?? null,
        teamIds: ids,
      });
    }

    const plan = planPodNight(rosters);
    if (plan.problems.length > 0) {
      throw new Error(`draw refused: ${JSON.stringify(plan.problems)}`);
    }
    for (const f of plan.fixtures) {
      await tx`
        insert into matches (competition_id, round, division_id, venue_id,
          home_team_id, away_team_id, court, status, scheduled_at)
        values (${comp.id}, ${WEEK}, ${f.divisionId}, ${f.venueId},
          ${f.homeTeamId}, ${f.awayTeamId}, ${f.court}, 'scheduled',
          ${DateTime.fromISO(night, { zone }).set({ hour: f.hour, minute: f.minute }).toISO()})`;
    }
    console.log(
      `\nplaced ${seen.size} teams; drew ${plan.fixtures.length} matches`,
    );
  });

  const check = await sql`
    select d.name as tier, count(*)::int as games,
           min(m.scheduled_at) as first, max(m.scheduled_at) as last
      from matches m join divisions d on d.id = m.division_id
     where m.competition_id = ${comp.id} and m.round = ${WEEK}
     group by d.name, d.tier_order order by d.tier_order`;
  for (const r of check) {
    const f = DateTime.fromJSDate(r.first as Date, { zone }).toFormat(
      "ccc LLL d h:mm a",
    );
    const l = DateTime.fromJSDate(r.last as Date, { zone }).toFormat("h:mm a");
    console.log(`  ${r.tier}: ${r.games} games, ${f} – ${l}`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
