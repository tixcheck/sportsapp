/**
 * Read-only integrity audit across the live database.
 *
 * Checks the invariants the app relies on but the schema cannot express:
 * states that should have advanced, rows that should have a partner, counts
 * that should agree. Every query is a SELECT.
 *
 *   npx tsx lib/db/audit-integrity.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

type Row = Record<string, unknown>;
let problems = 0;

async function check(
  name: string,
  why: string,
  rows: Row[] | Promise<Row[]>,
): Promise<void> {
  const r = await rows;
  if (r.length === 0) {
    console.log(`  ok    ${name}`);
    return;
  }
  problems += 1;
  console.log(`  FLAG  ${name} — ${r.length} row(s): ${why}`);
  for (const x of r.slice(0, 6)) console.log(`          ${JSON.stringify(x)}`);
  if (r.length > 6) console.log(`          …and ${r.length - 6} more`);
}

async function main() {
  console.log("=== referential integrity ===");

  await check(
    "matches point at real teams",
    "a match references a team that no longer exists",
    sql`select m.id from matches m
        left join teams h on h.id = m.home_team_id
        left join teams a on a.id = m.away_team_id
        where (m.home_team_id is not null and h.id is null)
           or (m.away_team_id is not null and a.id is null)`,
  );

  await check(
    "sets belong to a match",
    "an orphaned set would count toward nobody's standings",
    sql`select s.id from sets s left join matches m on m.id = s.match_id
        where m.id is null`,
  );

  await check(
    "appearances belong to a team in that match",
    "an appearance on a team not playing credits sets to the wrong people",
    sql`select ma.id, ma.player_name from match_appearances ma
        join matches m on m.id = ma.match_id
        where ma.team_id <> coalesce(m.home_team_id, '00000000-0000-0000-0000-000000000000'::uuid)
          and ma.team_id <> coalesce(m.away_team_id, '00000000-0000-0000-0000-000000000000'::uuid)`,
  );

  await check(
    "team members reference live users",
    "a roster row whose user was deleted",
    sql`select tm.team_id from team_members tm
        left join users u on u.id = tm.user_id where u.id is null`,
  );

  console.log("\n=== registration + payment state ===");

  await check(
    "no team stuck pending_payment once fully paid",
    "the fee is covered but the team was never admitted",
    sql`select t.id, t.name, sum(rp.total_cents - rp.refunded_cents)::int as paid_cents
        from teams t
        join registration_payments rp
          on rp.team_id = t.id and rp.status = 'paid'
        join competition_payment_settings cps
          on cps.competition_id = t.competition_id
        where t.status = 'pending_payment'
        group by t.id, t.name, cps.registration_fee_cents
        having sum(rp.total_cents - rp.refunded_cents) >= cps.registration_fee_cents`,
  );

  await check(
    "at most one OPEN charge per team",
    "a double-clicked Pay now would bill twice",
    sql`select team_id, count(*)::int as open_charges
        from registration_payments
        where status = 'pending' and kind = 'team_full' and team_id is not null
        group by team_id having count(*) > 1`,
  );

  await check(
    "no paid charge without a paid_at",
    "a confirmed payment with no timestamp cannot be reconciled",
    sql`select id, team_id from registration_payments
        where status = 'paid' and paid_at is null`,
  );

  await check(
    "refunds never exceed the charge",
    "a negative net payment",
    sql`select id, total_cents, refunded_cents from registration_payments
        where refunded_cents > total_cents`,
  );

  await check(
    "a captain enters a competition once (0114)",
    "the unique index should make this impossible",
    sql`select competition_id, captain_user_id, count(*)::int as teams
        from teams
        where status <> 'withdrawn' and captain_user_id is not null
        group by competition_id, captain_user_id having count(*) > 1`,
  );

  // Scoped deliberately. A team with NO captain is normal in two cases: a
  // sandbox org's mock data, and a ladder the organizer runs himself where no
  // player ever logs in (Mango has seven). What is NOT normal is a team people
  // have actually joined or paid for with nobody able to manage it — that team
  // cannot invite, and after 0055 there is no excuse for it.
  await check(
    "a team somebody joined or paid for has a captain",
    "nobody can manage it: no captain, and no captain invite outstanding",
    sql`select t.id, t.name from teams t
        join competitions c on c.id = t.competition_id
        join organizations o on o.id = c.org_id
        where t.status <> 'withdrawn'
          and t.captain_user_id is null
          and o.hidden_from_discovery = false
          and c.status in ('open', 'in_progress')
          and not exists (
            select 1 from team_invites ti
            where ti.team_id = t.id and ti.role = 'captain')
          and (
            exists (select 1 from team_members tm where tm.team_id = t.id)
            or exists (select 1 from registration_payments rp
                       where rp.team_id = t.id))`,
  );

  console.log("\n=== stats + appearances ===");

  await check(
    "appearances only where the league tracks them",
    "rows that no stats query will ever read",
    sql`select ma.competition_id, count(*)::int as rows
        from match_appearances ma
        join competitions c on c.id = ma.competition_id
        where c.track_appearances = false
        group by ma.competition_id`,
  );

  await check(
    "no duplicate appearance for one person in one match",
    "would double their season",
    sql`select match_id, team_id, coalesce(user_id::text, lower(player_name)) as who,
               count(*)::int as n
        from match_appearances
        group by 1,2,3 having count(*) > 1`,
  );

  console.log("\n=== addresses (geocode work) ===");

  await check(
    "address metadata is an object with a usable town",
    "a malformed metadata blob would break the locality tally",
    sql`select ra.id from registration_answers ra
        join registration_questions q on q.id = ra.question_id
        where q.kind = 'address' and ra.metadata is not null
          and (jsonb_typeof(ra.metadata) <> 'object'
               or (ra.metadata ? 'locality') = false)`,
  );

  console.log("\n=== schedule sanity ===");

  await check(
    "no match has a team playing itself",
    "a self-match would corrupt standings",
    sql`select id, home_team_id from matches
        where home_team_id is not null and home_team_id = away_team_id`,
  );

  await check(
    "no team double-booked at one time",
    "the same team on two courts at once",
    sql`with slots as (
          select id, scheduled_at, competition_id, home_team_id as team from matches
          where scheduled_at is not null and home_team_id is not null
          union all
          select id, scheduled_at, competition_id, away_team_id from matches
          where scheduled_at is not null and away_team_id is not null
        )
        select competition_id, team, scheduled_at, count(*)::int as games
        from slots group by 1,2,3 having count(*) > 1`,
  );

  await check(
    "completed matches have a score",
    "a completed match with no sets is a lost result",
    sql`select m.id from matches m
        left join sets s on s.match_id = m.id
        where m.status = 'completed' and s.id is null`,
  );

  console.log(
    problems === 0
      ? "\nNo integrity problems found."
      : `\n${problems} check(s) flagged — see above.`,
  );
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
