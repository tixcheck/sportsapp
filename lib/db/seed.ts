/**
 * Seed data for local/dev (PRD Phase 1).
 *
 * Creates:
 *   - 1 organization (owner: "Mark")
 *   - 1 indoor-6s league: 8 teams, an 8-week round-robin schedule
 *     (first 4 weeks played, with sets + confirmations; rest scheduled)
 *   - 1 beach-2s tournament: 12 teams snake-drafted into 3 pools of 4,
 *     with pool round-robin matches (Pool A fully played, B/C scheduled)
 *
 * Runs as a trusted server job over DATABASE_URL (the table-owner role, which
 * bypasses RLS) — allowed per CLAUDE.md. Idempotent: truncates first.
 *
 *   npm run db:seed
 */
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

import type { MatchFormat, WeeklySlot } from "./schema";
import {
  competitions,
  divisions,
  leagueSettings,
  matchConfirmations,
  matches,
  orgMembers,
  organizations,
  pools,
  sets,
  teamMembers,
  teams,
  tournamentSettings,
  users,
} from "./schema";

config({ path: ".env.local" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — cannot seed.");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set to seed auth users.",
  );
}

const client = postgres(connectionString, { prepare: false, max: 1 });
const db = drizzle(client, { schema: { users, organizations } });

// Admin (service-role) Supabase client — trusted server job only (CLAUDE.md).
// Used to create real, email-confirmed auth.users; the DB trigger mirrors each
// into public.users, satisfying the public.users.id -> auth.users(id) FK.
const admin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// All seeded accounts share this password (dev only) so you can log in as them.
const SEED_PASSWORD = "volleyball123";
const SEED_EMAIL_DOMAIN = "@example.com";

/** Delete pre-existing seed auth users so the seed can re-run cleanly. */
async function deleteSeedAuthUsers(): Promise<void> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email?.endsWith(SEED_EMAIL_DOMAIN)) {
        const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
        if (delErr) throw delErr;
      }
    }
    if (data.users.length < 1000) break;
  }
}

/** Create a confirmed auth user; the trigger mirrors it into public.users. */
async function createAuthUser(
  email: string,
  displayName: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error || !data.user) {
    throw error ?? new Error(`failed to create auth user ${email}`);
  }
  return data.user.id;
}

/** Create auth users sequentially (avoids admin-API rate limits). */
async function createAuthUsers(
  specs: { email: string; displayName: string }[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const s of specs) ids.push(await createAuthUser(s.email, s.displayName));
  return ids;
}

// --- match formats (PRD §6) ----------------------------------------------

const INDOOR6_BO5: MatchFormat = {
  bestOf: 5,
  setsToPoints: [25, 25, 25, 25, 15],
  winBy: 2,
};

const BEACH2_BO3: MatchFormat = {
  bestOf: 3,
  setsToPoints: [21, 21, 15],
  winBy: 2,
};

const BEACH2_POOL: MatchFormat = {
  bestOf: 3,
  setsToPoints: [21, 21, 11],
  winBy: 2,
  capMinutes: 45,
  tiebreakerSetTo: 11,
};

// --- helpers ---------------------------------------------------------------

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Tuesday 2026-01-13 19:00 ET as the league's week-1 slot. */
function leagueWeekDate(weekIndex: number): Date {
  const base = new Date("2026-01-13T19:00:00-05:00");
  base.setDate(base.getDate() + weekIndex * 7);
  return base;
}

/**
 * Circle-method round-robin over team indices (even count required).
 * Returns rounds; each round is a list of [home, away] index pairs.
 */
function roundRobin(count: number): [number, number][][] {
  const arr = Array.from({ length: count }, (_, i) => i);
  const rounds: [number, number][][] = [];
  for (let r = 0; r < count - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < count / 2; i++) {
      pairs.push([arr[i], arr[count - 1 - i]]);
    }
    // Rotate everything except the first fixed element.
    const rest = arr.slice(1);
    rest.unshift(rest.pop()!);
    arr.splice(1, arr.length - 1, ...rest);
    rounds.push(pairs);
  }
  return rounds;
}

type SetScore = { setNumber: number; homeScore: number; awayScore: number };

/** Generate plausible completed-set scores; `homeWins` decides the match. */
function generateSets(format: MatchFormat, homeWins: boolean): SetScore[] {
  const winsNeeded = Math.ceil(format.bestOf / 2);
  const loserSetWins = randInt(0, winsNeeded - 1);
  const totalSets = winsNeeded + loserSetWins;

  // Match loser steals the first `loserSetWins` sets; winner takes the rest
  // (so the deciding set always belongs to the match winner).
  const setWinnerIsHome: boolean[] = [];
  for (let i = 0; i < totalSets; i++) {
    const loserTakesThis = i < loserSetWins;
    setWinnerIsHome.push(loserTakesThis ? !homeWins : homeWins);
  }

  return setWinnerIsHome.map((winnerIsHome, i) => {
    const target = format.setsToPoints[i] ?? format.setsToPoints.at(-1)!;
    const margin = target <= 15 ? randInt(2, 4) : randInt(2, 6);
    const loserScore = Math.max(0, target - margin);
    return {
      setNumber: i + 1,
      homeScore: winnerIsHome ? target : loserScore,
      awayScore: winnerIsHome ? loserScore : target,
    };
  });
}

// --- data ------------------------------------------------------------------

const LEAGUE_TEAM_NAMES = [
  "Bump Set Spike",
  "Net Profits",
  "Block Party",
  "Dig It",
  "Setting Ducks",
  "Served Cold",
  "Pancake Posse",
  "The Sideouts",
];

// 12 beach 2s partnerships (surname pairs), to be snake-drafted by seed.
const BEACH_PAIRS: [string, string][] = [
  ["Kohl", "Thomas"],
  ["Checinski", "Bowmaster"],
  ["Chadwick", "Rakam"],
  ["Minyaylo", "Dioso"],
  ["Tran", "Nguyen"],
  ["Singh", "Patel"],
  ["Okafor", "Mensah"],
  ["Rossi", "Bianchi"],
  ["Larsson", "Berg"],
  ["Kim", "Park"],
  ["Silva", "Costa"],
  ["Dubois", "Tremblay"],
];

async function main() {
  console.log("Resetting tables…");
  await db.execute(sql`
    truncate table
      "standings_cache", "match_audit", "match_confirmations", "sets",
      "matches", "team_members", "teams", "pools", "divisions",
      "tournament_settings", "league_settings", "competitions",
      "org_members", "organizations", "users"
    restart identity cascade
  `);

  // Remove prior seed auth users (public rows are already truncated above, so
  // the auth.users -> public.users cascade has nothing left to restrict).
  console.log("Removing existing seed auth users…");
  await deleteSeedAuthUsers();

  // --- organization + owner ------------------------------------------------
  console.log("Seeding organization…");
  const ownerId = await createAuthUser("mark@example.com", "Mark Organizer");

  const [org] = await db
    .insert(organizations)
    .values({
      slug: "toronto-volleyball-collective",
      name: "Toronto Volleyball Collective",
      contactEmail: "mark@example.com",
      ownerUserId: ownerId,
    })
    .returning();

  await db.insert(orgMembers).values({
    orgId: org.id,
    userId: ownerId,
    role: "owner",
  });

  // --- league --------------------------------------------------------------
  console.log("Seeding indoor-6s league…");
  const [league] = await db
    .insert(competitions)
    .values({
      orgId: org.id,
      slug: "tuesday-indoor-6s-winter-2026",
      name: "Tuesday Indoor 6s — Winter 2026",
      type: "league",
      sport: "indoor6",
      status: "in_progress",
      startDate: "2026-01-13",
      endDate: "2026-03-10",
      venue: "Mayfair Lakeshore",
      timezone: "America/Toronto",
      matchFormat: INDOOR6_BO5,
      visibility: "public",
    })
    .returning();

  const weeklySlots: WeeklySlot[] = [
    { dayOfWeek: 2, startTime: "19:00", courts: 2 },
  ];
  await db.insert(leagueSettings).values({
    competitionId: league.id,
    weeklySlots,
    roundsPerTeam: 1,
    blackoutDates: ["2026-02-17"],
    promotionRelegation: false,
  });

  const [leagueDivision] = await db
    .insert(divisions)
    .values({
      competitionId: league.id,
      name: "Adult Competitive",
      tierOrder: 0,
    })
    .returning();

  // 8 captains + 8 teams
  const leagueCaptainIds = await createAuthUsers(
    LEAGUE_TEAM_NAMES.map((_, i) => ({
      email: `league.captain${i + 1}@example.com`,
      displayName: `League Captain ${i + 1}`,
    })),
  );

  const leagueTeams = await db
    .insert(teams)
    .values(
      LEAGUE_TEAM_NAMES.map((name, i) => ({
        competitionId: league.id,
        divisionId: leagueDivision.id,
        name,
        seed: i + 1,
        captainUserId: leagueCaptainIds[i],
      })),
    )
    .returning();

  await db.insert(teamMembers).values(
    leagueTeams.map((t, i) => ({
      teamId: t.id,
      userId: leagueCaptainIds[i],
      role: "captain" as const,
      jerseyNumber: 1,
    })),
  );

  // 8-week schedule: full single round-robin (7 rounds) + a week-8 rematch of
  // round 1 (home/away swapped). Weeks 1–4 are played; weeks 5–8 scheduled.
  const rrRounds = roundRobin(leagueTeams.length); // 7 rounds × 4 matches
  const week8: [number, number][] = rrRounds[0].map(([h, a]) => [a, h]);
  const allRounds = [...rrRounds, week8];

  for (let week = 0; week < allRounds.length; week++) {
    const played = week < 4;
    const when = leagueWeekDate(week);
    for (let m = 0; m < allRounds[week].length; m++) {
      const [homeIdx, awayIdx] = allRounds[week][m];
      const home = leagueTeams[homeIdx];
      const away = leagueTeams[awayIdx];
      const [match] = await db
        .insert(matches)
        .values({
          competitionId: league.id,
          round: week + 1,
          homeTeamId: home.id,
          awayTeamId: away.id,
          scheduledAt: when,
          court: `Court ${(m % 2) + 1}`,
          status: played ? "completed" : "scheduled",
        })
        .returning();

      if (played) {
        const homeWins = Math.random() < 0.5;
        const setScores = generateSets(INDOOR6_BO5, homeWins);
        await db.insert(sets).values(
          setScores.map((s) => ({
            matchId: match.id,
            setNumber: s.setNumber,
            homeScore: s.homeScore,
            awayScore: s.awayScore,
          })),
        );
        await db.insert(matchConfirmations).values([
          {
            matchId: match.id,
            captainUserId: home.captainUserId,
            action: "submitted" as const,
          },
          {
            matchId: match.id,
            captainUserId: away.captainUserId,
            action: "confirmed" as const,
          },
        ]);
      }
    }
  }

  // --- tournament ----------------------------------------------------------
  console.log("Seeding beach-2s tournament…");
  const [tournament] = await db
    .insert(competitions)
    .values({
      orgId: org.id,
      slug: "toronto-sand-classic-jul-2026",
      name: "Toronto Sand Classic — July 2026",
      type: "tournament",
      sport: "beach2",
      status: "in_progress",
      startDate: "2026-07-11",
      endDate: "2026-07-11",
      venue: "Ashbridges Bay",
      timezone: "America/Toronto",
      matchFormat: BEACH2_BO3,
      visibility: "public",
    })
    .returning();

  await db.insert(tournamentSettings).values({
    competitionId: tournament.id,
    poolSize: 4,
    poolFormat: BEACH2_POOL,
    bracketType: "single_elim",
    registrationDeadline: new Date("2026-07-04T23:59:00-04:00"),
  });

  const [tDivision] = await db
    .insert(divisions)
    .values({ competitionId: tournament.id, name: "Open", tierOrder: 0 })
    .returning();

  const poolRows = await db
    .insert(pools)
    .values(
      ["A", "B", "C"].map((name, i) => ({
        competitionId: tournament.id,
        divisionId: tDivision.id,
        name: `Pool ${name}`,
        sortOrder: i,
      })),
    )
    .returning();

  // 12 captains + 12 teams, snake-drafted by seed into 3 pools.
  const tCaptainIds = await createAuthUsers(
    BEACH_PAIRS.map((pair, i) => ({
      email: `beach.captain${i + 1}@example.com`,
      displayName: pair[0],
    })),
  );

  // Snake draft: seed 1→A,2→B,3→C,4→C,5→B,6→A,7→A,8→B,9→C,10→C,11→B,12→A …
  const poolCount = poolRows.length;
  const snakePoolForSeed = (seedIndex: number): number => {
    const row = Math.floor(seedIndex / poolCount);
    const pos = seedIndex % poolCount;
    return row % 2 === 0 ? pos : poolCount - 1 - pos;
  };

  const tTeams = await db
    .insert(teams)
    .values(
      BEACH_PAIRS.map((pair, i) => ({
        competitionId: tournament.id,
        divisionId: tDivision.id,
        poolId: poolRows[snakePoolForSeed(i)].id,
        name: `${pair[0]}/${pair[1]}`,
        seed: i + 1,
        captainUserId: tCaptainIds[i],
      })),
    )
    .returning();

  await db.insert(teamMembers).values(
    tTeams.map((t, i) => ({
      teamId: t.id,
      userId: tCaptainIds[i],
      role: "captain" as const,
    })),
  );

  // Pool round-robins. Pool A is fully played; B and C are scheduled.
  const tournamentStart = new Date("2026-07-11T09:00:00-04:00");
  for (let p = 0; p < poolRows.length; p++) {
    const pool = poolRows[p];
    const poolTeams = tTeams.filter((t) => t.poolId === pool.id);
    const poolRounds = roundRobin(poolTeams.length); // 3 rounds × 2 matches
    const playPool = p === 0;
    for (let r = 0; r < poolRounds.length; r++) {
      for (let m = 0; m < poolRounds[r].length; m++) {
        const [homeIdx, awayIdx] = poolRounds[r][m];
        const home = poolTeams[homeIdx];
        const away = poolTeams[awayIdx];
        const when = new Date(tournamentStart);
        when.setMinutes(when.getMinutes() + r * 45);
        const [match] = await db
          .insert(matches)
          .values({
            competitionId: tournament.id,
            poolId: pool.id,
            round: r + 1,
            homeTeamId: home.id,
            awayTeamId: away.id,
            scheduledAt: when,
            court: `Court ${p + 1}`,
            status: playPool ? "completed" : "scheduled",
          })
          .returning();

        if (playPool) {
          const homeWins = Math.random() < 0.5;
          const setScores = generateSets(BEACH2_POOL, homeWins);
          await db.insert(sets).values(
            setScores.map((s) => ({
              matchId: match.id,
              setNumber: s.setNumber,
              homeScore: s.homeScore,
              awayScore: s.awayScore,
            })),
          );
          await db.insert(matchConfirmations).values([
            {
              matchId: match.id,
              captainUserId: home.captainUserId,
              action: "submitted" as const,
            },
            {
              matchId: match.id,
              captainUserId: away.captainUserId,
              action: "confirmed" as const,
            },
          ]);
        }
      }
    }
  }

  // --- summary -------------------------------------------------------------
  const counts = await db.execute<{ tbl: string; n: number }>(sql`
    select 'users' as tbl, count(*)::int as n from users
    union all select 'organizations', count(*)::int from organizations
    union all select 'competitions', count(*)::int from competitions
    union all select 'teams', count(*)::int from teams
    union all select 'pools', count(*)::int from pools
    union all select 'matches', count(*)::int from matches
    union all select 'sets', count(*)::int from sets
    union all select 'match_confirmations', count(*)::int from match_confirmations
    order by tbl
  `);
  console.log("Seed complete:");
  for (const row of counts) console.log(`  ${row.tbl}: ${row.n}`);
  console.log(
    `\nSeeded accounts are confirmed and can log in. Password: ${SEED_PASSWORD}`,
  );
  console.log("  owner:           mark@example.com");
  console.log("  league captains: league.captain1..8@example.com");
  console.log("  beach captains:  beach.captain1..12@example.com");
}

main()
  .then(async () => {
    await client.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await client.end();
    process.exit(1);
  });
