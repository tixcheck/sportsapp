/**
 * A DEMO of BVL Women Only Wednesdays 2026/27, for their AGM — what the app
 * shows an organizer and a player, on this season's real teams.
 *
 *   npx tsx lib/db/setup-bvl-demo-2026.ts            # report only
 *   npx tsx lib/db/setup-bvl-demo-2026.ts --write    # build it
 *   npx tsx lib/db/setup-bvl-demo-2026.ts --reset    # delete it and rebuild
 *
 * A COPY in Test Org, never BVL's real league. The real one is public with 85
 * players rostered; a mock schedule there would appear on their pages and in
 * their schedule emails. The copy takes the 22 team NAMES from the live league
 * at build time and nothing else — no players, no emails.
 *
 * Tiers are placeholders (seeded from BVL's own 2025/26 Round 6 sheet, new
 * teams at the bottom) and the grids are the ones on that sheet — the same as
 * the printed sample schedule, so the two tell one story. Week 1 carries
 * made-up scores so the standings have something to show; week 2 is upcoming.
 *
 * Two demo logins on example.com (never delivered): an organizer of Test Org,
 * and a player on Setsy Ladies. Passwords are written to the file named by
 * DEMO_CREDENTIALS_OUT, never to the repo.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import postgres from "postgres";
import { DateTime } from "luxon";
import { createClient } from "@supabase/supabase-js";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const write =
  process.argv.includes("--write") || process.argv.includes("--reset");
const reset = process.argv.includes("--reset");

const LIVE_SLUG = "2026-2027-indoor-women-s-spiking-6s";
const DEMO_ORG = "test-org";
const SLUG = "bvl-women-wednesdays-2026-demo";
const NAME = "BVL Women Only Wednesdays — 2026/27 (Demo)";
const ZONE = "America/Toronto";
const ORGANIZER_EMAIL = "bvl-demo-organizer@example.com";
const PLAYER_EMAIL = "bvl-demo-player@example.com";
const PLAYER_TEAM = "Setsy Ladies";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const TIER_PLAN: [string, string[]][] = [
  [
    "Tier A",
    [
      "NRG",
      "Registered Sets Offenders",
      "Not Fast... VB chicks",
      "Diggin’ & Gigglin’",
      "Mixed Nuts",
      "Big Dig Energy",
    ],
  ],
  [
    "Tier B",
    [
      "Way Out",
      "ACE 23",
      "That’s What She Set",
      "Setsy Ladies",
      "Sets In The City",
      "Hit That!",
    ],
  ],
  [
    "Tier C",
    ["Bring It On", "Kiss My Ace", "All-In", "HOT 2 VOLLEY", "Believe"],
  ],
  [
    "Tier D",
    ["Volley Back Girl", "K-os", "Saucy Tips", "Shorties", "Indy Team 1"],
  ],
];

// BVL's grids. Six teams on three courts: five rounds make a round robin,
// three a night, rolling on. Five teams on two courts: the whole round robin
// every night, one sitting each slot.
const R6 = [
  [
    [1, 6],
    [4, 5],
    [2, 3],
  ],
  [
    [1, 3],
    [4, 6],
    [2, 5],
  ],
  [
    [3, 5],
    [2, 6],
    [1, 4],
  ],
  [
    [2, 4],
    [1, 5],
    [3, 6],
  ],
  [
    [1, 2],
    [3, 4],
    [5, 6],
  ],
];
const R5_W1 = [
  [
    [1, 2],
    [3, 4],
  ],
  [
    [1, 3],
    [2, 5],
  ],
  [
    [4, 5],
    [2, 3],
  ],
  [
    [1, 5],
    [2, 4],
  ],
  [
    [1, 4],
    [3, 5],
  ],
];
const R5_W2 = [
  [
    [4, 5],
    [2, 3],
  ],
  [
    [1, 5],
    [2, 4],
  ],
  [
    [1, 2],
    [3, 4],
  ],
  [
    [1, 4],
    [3, 5],
  ],
  [
    [1, 3],
    [2, 5],
  ],
];
const EARLY6 = ["18:15", "18:55", "19:35"];
const LATE6 = ["20:00", "20:40", "21:20"];
const T5 = ["18:30", "18:55", "19:20", "19:45", "20:10"];

const SIX_FORMAT = { bestOf: 2, setsToPoints: [25, 25], winBy: 2 };
// "Start at 4-4, games to 21" on their sheet: one game to 21.
const FIVE_FORMAT = { bestOf: 1, setsToPoints: [21], winBy: 2 };

type Game = {
  tier: string;
  gym: string;
  court: string;
  at: string;
  home: number;
  away: number;
  five: boolean;
};

function night(
  date: string,
  plan: {
    gym: string;
    tier: string;
    times: string[];
    grid: number[][][];
    five: boolean;
  }[],
): Game[] {
  return plan.flatMap((p) =>
    p.grid.flatMap((games, i) =>
      games.map((g, c) => ({
        tier: p.tier,
        gym: p.gym,
        court: "abc"[c],
        five: p.five,
        at: DateTime.fromISO(`${date}T${p.times[i]}`, { zone: ZONE }).toISO()!,
        home: g[0],
        away: g[1],
      })),
    ),
  );
}

const WEEK1 = night("2026-10-14", [
  {
    gym: "Turner Fenton North",
    tier: "Tier A",
    times: EARLY6,
    grid: [R6[0], R6[1], R6[2]],
    five: false,
  },
  {
    gym: "Turner Fenton North",
    tier: "Tier B",
    times: LATE6,
    grid: [R6[0], R6[1], R6[2]],
    five: false,
  },
  { gym: "Terry Miller", tier: "Tier C", times: T5, grid: R5_W1, five: true },
  {
    gym: "St. Thomas Aquinas",
    tier: "Tier D",
    times: T5,
    grid: R5_W1,
    five: true,
  },
]);
const WEEK2 = night("2026-10-21", [
  {
    gym: "Turner Fenton North",
    tier: "Tier B",
    times: EARLY6,
    grid: [R6[3], R6[4], R6[0]],
    five: false,
  },
  {
    gym: "Turner Fenton North",
    tier: "Tier A",
    times: LATE6,
    grid: [R6[3], R6[4], R6[0]],
    five: false,
  },
  { gym: "Terry Miller", tier: "Tier D", times: T5, grid: R5_W2, five: true },
  {
    gym: "St. Thomas Aquinas",
    tier: "Tier C",
    times: T5,
    grid: R5_W2,
    five: true,
  },
]);

/** Deterministic, so a rebuild prints the same standings. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** Made-up but plausible: the higher seed usually wins, never always. */
function scoreGame(
  g: Game,
  rand: () => number,
): { home: number; away: number }[] {
  const favour = g.home < g.away ? 0.62 : 0.38;
  const target = g.five ? 21 : 25;
  const sets = g.five ? 1 : 2;
  return Array.from({ length: sets }, () => {
    const homeWins = rand() < favour;
    const loser = target - 2 - Math.floor(rand() * (g.five ? 9 : 10));
    return homeWins
      ? { home: target, away: loser }
      : { home: loser, away: target };
  });
}

async function main() {
  const [live] =
    await sql`select id, name from competitions where slug = ${LIVE_SLUG}`;
  const [org] =
    await sql`select id, name, hidden_from_discovery from organizations where slug = ${DEMO_ORG}`;
  if (!live || !org) throw new Error("live league or Test Org not found");

  const liveTeams = await sql`
    select name from teams where competition_id = ${live.id} and status <> 'withdrawn'`;
  const byNorm = new Map(
    liveTeams.map((t) => [norm(t.name as string), t.name as string]),
  );
  const tiers = TIER_PLAN.map(([tier, names]) => ({
    tier,
    teams: names.map((n) => {
      const real = byNorm.get(norm(n));
      if (!real) throw new Error(`not in the live league: ${n}`);
      byNorm.delete(norm(n));
      return real;
    }),
  }));
  if (byNorm.size > 0)
    throw new Error(
      `live teams not placed: ${[...byNorm.values()].join(", ")}`,
    );
  console.log(`${live.name}: ${liveTeams.length} live teams, all placed`);
  for (const t of tiers) console.log(`  ${t.tier}: ${t.teams.join(" · ")}`);

  const venues = await sql`
    select id, name from venues
     where org_id = ${org.id} and name in ('Turner Fenton North','Terry Miller','St. Thomas Aquinas')`;
  const venueId = new Map(
    venues.map((v) => [v.name as string, v.id as string]),
  );
  if (venueId.size !== 3) throw new Error("Test Org is missing a gym");

  console.log(
    `\n  week 1: ${WEEK1.length} games (scored) · week 2: ${WEEK2.length} games (upcoming)`,
  );
  const [existing] =
    await sql`select id from competitions where slug = ${SLUG}`;
  if (existing && !reset) {
    console.log(`\n  already built (${existing.id}) — pass --reset to rebuild`);
    await sql.end();
    return;
  }
  if (!write) {
    console.log("\n  nothing written — pass --write to build");
    await sql.end();
    return;
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: { persistSession: false },
    },
  );
  const credentials: Record<string, { email: string; password: string }> = {};
  async function demoUser(key: string, email: string, displayName: string) {
    const password = randomBytes(12).toString("base64url");
    const [known] = await sql`select id from users where email = ${email}`;
    let id = known?.id as string | undefined;
    if (id) {
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) throw error;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });
      if (error) throw error;
      id = data.user.id;
    }
    // Never mail an example.com address, however the app decides to reach out.
    await sql`
      update users set display_name = ${displayName}, notify_results = false,
             notify_schedule_changes = false, notify_weekly = false, notify_org_messages = false
       where id = ${id}`;
    credentials[key] = { email, password };
    return id;
  }
  const organizerId = await demoUser(
    "organizer",
    ORGANIZER_EMAIL,
    "Demo Organizer",
  );
  const playerId = await demoUser("player", PLAYER_EMAIL, "Demo Player");

  const compId = await sql.begin(async (tx) => {
    if (existing) await tx`delete from competitions where id = ${existing.id}`;
    const [comp] = await tx`
      insert into competitions (
        org_id, slug, name, type, sport, status, visibility, start_date, end_date,
        venue, timezone, match_format, allow_captain_entry, allow_ref_entry,
        allow_organizer_entry, require_confirmation, teams_referee, description
      ) values (
        ${org.id}, ${SLUG}, ${NAME}, 'league', 'indoor6', 'scheduled', 'public',
        '2026-10-14', '2026-10-21', 'Brampton school gyms', ${ZONE},
        ${sql.json(SIX_FORMAT)}, true, false, true, false, false,
        ${"A demo for the BVL AGM, built on this season's registered teams. Tiers, times and scores are illustrative — this is not the 2026/27 schedule."}
      ) returning id`;
    await tx`
      insert into league_settings (
        competition_id, weekly_slots, rounds_per_team, games_per_week,
        minutes_per_game, tiebreaker, pairing_order, court_list, promotion_relegation
      ) values (
        ${comp.id}, ${sql.json([{ dayOfWeek: 3, startTime: "18:15", courts: 7 }])},
        1, 3, 40, 'ova', 'circle',
        ${sql.json([
          ...["a", "b", "c"].map((label) => ({
            label,
            prime: false,
            venueId: venueId.get("Turner Fenton North"),
          })),
          ...["a", "b"].map((label) => ({
            label,
            prime: false,
            venueId: venueId.get("Terry Miller"),
          })),
          ...["a", "b"].map((label) => ({
            label,
            prime: false,
            venueId: venueId.get("St. Thomas Aquinas"),
          })),
        ])},
        false
      )`;

    const teamId = new Map<string, string>(); // "Tier A:3" → id
    const idByName = new Map<string, string>();
    for (const [order, t] of tiers.entries()) {
      const [div] = await tx`
        insert into divisions (competition_id, name, tier_order)
        values (${comp.id}, ${t.tier}, ${order}) returning id`;
      for (const [i, name] of t.teams.entries()) {
        const [team] = await tx`
          insert into teams (competition_id, division_id, name, seed, status)
          values (${comp.id}, ${div.id}, ${name}, ${i + 1}, 'active') returning id`;
        teamId.set(`${t.tier}:${i + 1}`, team.id as string);
        idByName.set(name, team.id as string);
      }
      (t as { divisionId?: string }).divisionId = div.id as string;
    }
    const divisionOf = new Map(
      tiers.map((t) => [t.tier, (t as { divisionId?: string }).divisionId!]),
    );

    const rand = rng(2026);
    for (const [week, games] of [
      [1, WEEK1],
      [2, WEEK2],
    ] as const) {
      for (const g of games) {
        const [m] = await tx`
          insert into matches (
            competition_id, division_id, venue_id, home_team_id, away_team_id,
            court, scheduled_at, status, match_format
          ) values (
            ${comp.id}, ${divisionOf.get(g.tier)!}, ${venueId.get(g.gym)!},
            ${teamId.get(`${g.tier}:${g.home}`)!}, ${teamId.get(`${g.tier}:${g.away}`)!},
            ${g.court}, ${g.at}, ${week === 1 ? "completed" : "scheduled"},
            ${g.five ? sql.json(FIVE_FORMAT) : null}
          ) returning id`;
        if (week === 1) {
          for (const [n, s] of scoreGame(g, rand).entries()) {
            await tx`
              insert into sets (match_id, set_number, home_score, away_score)
              values (${m.id}, ${n + 1}, ${s.home}, ${s.away})`;
          }
        }
      }
    }

    await tx`
      insert into org_members (org_id, user_id, role) values (${org.id}, ${organizerId}, 'organizer')
      on conflict (org_id, user_id) do update set role = 'organizer'`;
    await tx`
      insert into team_members (team_id, user_id, role)
      values (${idByName.get(PLAYER_TEAM)!}, ${playerId}, 'player')`;
    return comp.id as string;
  });

  const [check] = await sql`
    select (select count(*)::int from teams where competition_id = ${compId}) as teams,
           (select count(*)::int from matches where competition_id = ${compId}) as games,
           (select count(*)::int from matches where competition_id = ${compId} and status = 'completed') as scored,
           (select count(*)::int from sets s join matches m on m.id = s.match_id where m.competition_id = ${compId}) as sets,
           (select jsonb_typeof(match_format) from competitions where id = ${compId}) as fmt`;
  console.log(`\n  built ${compId}:`, check);
  console.log(`  public link: https://www.mysportsapp.ca/l/${SLUG}`);
  console.log(`  org hidden from discovery: ${org.hidden_from_discovery}`);

  const out = process.env.DEMO_CREDENTIALS_OUT;
  if (out) {
    writeFileSync(
      out,
      JSON.stringify(
        { competitionId: compId, orgId: org.id, slug: SLUG, ...credentials },
        null,
        2,
      ),
    );
    console.log(`  demo logins written to ${out}`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
