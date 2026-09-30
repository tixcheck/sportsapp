/**
 * SMVA step 8 — week 1 as it was actually played (Mon 28 Sep 2026).
 *
 *   npx tsx lib/db/smva-08-week1-actual.ts            # report only
 *   npx tsx lib/db/smva-08-week1-actual.ts --write    # apply
 *
 * The night did not follow the published schedule the app was loaded from:
 * teams were moved between gyms on the day. The seven signed gym sheets are
 * the record, so week 1's placements are set from them — each team in the gym
 * it played, in the seat (A, B, C…) its sheet gave it — and each gym's final
 * standings are loaded beside them.
 *
 * Ranks follow the organizer's rules (2026-09-29): order by Total Points, and
 * a tie goes to the team seated higher going in ("ties go to the team with the
 * higher ranking going in"). That settles Agincourt, whose sheet has no ranks,
 * and King, whose written ranks were wrong ("just look at points"). It also
 * puts Insiders over Giant Crows at Wexford: Crows' total was written 16, but
 * their games add to 12 and the sheet's own 36 only balances at 12 — level
 * with Insiders, who sat higher.
 *
 * Deliberately NOT done here, pending the organizer:
 *   - Porter: LOGAN played but isn't in the app — new team, or a renamed one?
 *     Chefs is seated there and the two who played elsewhere are moved out,
 *     but no ranks are loaded.
 *   - OG, Zeus and Team 39 played nowhere. Left where they are, unranked — so
 *     Porter, Wexford and King cannot be locked until he says whether they
 *     forfeited the night or have left the league.
 * Bethune was loaded on 2026-09-29 and matched the sheet exactly; untouched.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const WRITE = process.argv.includes("--write");
const SLUG = "smva-monday-ladder-2026-2027";

type Gym = {
  tier: string;
  /** Seat order from the sheet: index 0 is A. */
  seats: string[];
  /** Finishing order with Total Points; omitted where it waits on the organizer. */
  results?: [string, number][];
  /** The sheet's printed night total — the results must add to it. */
  total?: number;
};

const GYMS: Gym[] = [
  {
    tier: "Tier 2 — Leacock",
    seats: [
      "INVICTUS",
      "SVEIKS",
      "CONNEX",
      "MISFITS",
      "THE FACTORY",
      "HYDRATION NATION",
    ],
    results: [
      ["CONNEX", 16],
      ["HYDRATION NATION", 14],
      ["INVICTUS", 12],
      ["SVEIKS", 8],
      ["THE FACTORY", 7],
      ["MISFITS", 3],
    ],
    total: 60,
  },
  {
    tier: "Tier 3 — Agincourt",
    seats: [
      "SUNDAY KNIGHTS",
      "BIG D BOYS",
      "BRONIN",
      "BEERS",
      "BANGERS AND SMASH",
      "TRUE NORTH VOLLEYBALL",
    ],
    results: [
      ["BIG D BOYS", 18],
      ["BRONIN", 12],
      ["BANGERS AND SMASH", 8],
      ["TRUE NORTH VOLLEYBALL", 8],
      ["SUNDAY KNIGHTS", 7],
      ["BEERS", 7],
    ],
    total: 60,
  },
  {
    tier: "Tier 4 — PPL",
    seats: ["TRAFFIC", "OUTTAHAND", "UNITED", "SMASHED"],
    results: [
      ["UNITED", 11],
      ["TRAFFIC", 9],
      ["OUTTAHAND", 9],
      ["SMASHED", 7],
    ],
    total: 36,
  },
  {
    // Seat B is LOGAN's, pending the organizer. OG stays, unseated, until then.
    tier: "Tier 5 — Porter",
    seats: ["CHEFS", "", "BOUNCETOWN", "KATZ", "B.O.M.B."],
  },
  {
    tier: "Tier 6 — Wexford",
    seats: ["INSIDERS", "TGS", "GIANT CROWS", "DEATH FROM ABOVE"],
    results: [
      ["INSIDERS", 12],
      ["GIANT CROWS", 12],
      ["TGS", 6],
      ["DEATH FROM ABOVE", 6],
    ],
    total: 36,
  },
  {
    tier: "Tier 7 — King",
    seats: [
      "BIG DIG ENERGY",
      "KILLER HITMEN",
      "COBRAS",
      "TORONTO WARRIORS",
      "SCREAMING EAGLES",
      "Blok Choy",
    ],
    results: [
      ["BIG DIG ENERGY", 16],
      ["Blok Choy", 16],
      ["COBRAS", 13],
      ["SCREAMING EAGLES", 7],
      ["KILLER HITMEN", 4],
      ["TORONTO WARRIORS", 4],
    ],
    total: 60,
  },
];

async function main() {
  const [comp] = await sql`select id from competitions where slug = ${SLUG}`;
  const [locked] = await sql`
    select count(*)::int as n from ladder_placements where competition_id = ${comp.id} and week = 2`;
  if (locked.n > 0)
    throw new Error("week 1 is already locked — undo the lock first");

  const divs =
    await sql`select id, name from divisions where competition_id = ${comp.id}`;
  const divId = new Map(divs.map((d) => [d.name as string, d.id as string]));
  const teams =
    await sql`select id, name from teams where competition_id = ${comp.id}`;
  const teamId = new Map(teams.map((t) => [t.name as string, t.id as string]));

  // Every name must exist, and the points must balance, before anything moves.
  for (const g of GYMS) {
    if (!divId.has(g.tier)) throw new Error(`no tier "${g.tier}"`);
    for (const n of g.seats.filter(Boolean)) {
      if (!teamId.has(n)) throw new Error(`no team "${n}"`);
    }
    if (g.results) {
      const sum = g.results.reduce((a, [, p]) => a + p, 0);
      if (sum !== g.total)
        throw new Error(
          `${g.tier}: points add to ${sum}, sheet says ${g.total}`,
        );
      const seated = new Set(g.seats);
      if (
        g.results.length !== g.seats.length ||
        g.results.some(([n]) => !seated.has(n))
      ) {
        throw new Error(`${g.tier}: results and seats name different teams`);
      }
    }
    console.log(
      `${g.tier}: ${g.seats.map((n, i) => `${"ABCDEFG"[i]} ${n || "(Logan — pending)"}`).join(" · ")}`,
    );
    if (g.results)
      console.log(
        `   ${g.results.map(([n, p], i) => `#${i + 1} ${n} ${p}`).join(" · ")}`,
      );
  }
  if (!WRITE) {
    console.log("\nnothing written — pass --write to apply");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    for (const g of GYMS) {
      const div = divId.get(g.tier)!;
      // Ranks are unique per tier and week: clear before re-seating anybody.
      await tx`update ladder_placements set result_rank = null, result_points = null
                where division_id = ${div} and week = 1`;
      for (const [pos, name] of g.seats.entries()) {
        if (!name) continue;
        const id = teamId.get(name)!;
        const moved = await tx`
          update ladder_placements set division_id = ${div}, position = ${pos}
           where team_id = ${id} and week = 1 returning id`;
        if (moved.length !== 1)
          throw new Error(`${name} has no week-1 placement`);
        // The team's CURRENT tier, which the rest of the app reads.
        await tx`update teams set division_id = ${div} where id = ${id}`;
      }
    }
    // Whoever is left in a gym without a seat on its sheet played nowhere
    // (OG, Zeus, Team 39). Sit them after the last real seat so no two teams
    // share a letter while the organizer decides what they are.
    for (const g of GYMS) {
      const div = divId.get(g.tier)!;
      const seated = new Set(
        g.seats.filter(Boolean).map((n) => teamId.get(n)!),
      );
      const rest = await tx`
        select id, team_id from ladder_placements where division_id = ${div} and week = 1`;
      let next = g.seats.length;
      for (const r of rest) {
        if (seated.has(r.team_id as string)) continue;
        await tx`update ladder_placements set position = ${next++} where id = ${r.id}`;
      }
    }
    for (const g of GYMS) {
      if (!g.results) continue;
      const div = divId.get(g.tier)!;
      for (const [i, [name, pts]] of g.results.entries()) {
        await tx`update ladder_placements set result_rank = ${i + 1}, result_points = ${pts}
                  where team_id = ${teamId.get(name)!} and week = 1 and division_id = ${div}`;
      }
    }
  });

  const after = await sql`
    select d.name as tier, d.tier_order, p.position, t.name, p.result_rank, p.result_points
      from ladder_placements p join teams t on t.id = p.team_id join divisions d on d.id = p.division_id
     where p.competition_id = ${comp.id} and p.week = 1
     order by d.tier_order, p.position`;
  let last = "";
  for (const r of after) {
    if (r.tier !== last) {
      console.log(`\n${r.tier}`);
      last = r.tier;
    }
    console.log(
      `  ${"ABCDEFGH"[r.position] ?? r.position} ${r.name}${r.result_rank ? `  #${r.result_rank} (${r.result_points})` : ""}`,
    );
  }
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
