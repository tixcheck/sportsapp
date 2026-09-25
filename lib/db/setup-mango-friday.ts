/**
 * Create Mango Sports' Friday Men's League.
 *
 *   npx tsx lib/db/setup-mango-friday.ts
 *
 * THE FORMAT (the organizer's words): 18 players, 3 captains. Captains pick
 * teams every 2 weeks. Week 1 is a round robin — 6 games of 20 minutes, each
 * team playing each other twice. Week 2 is playoffs: first place byes to the
 * 9pm final, the other two play a semi at 8pm. Then re-draft and repeat.
 *
 * WHAT THIS DOES AND DOES NOT DO. It creates the competition and its settings
 * and turns on individual sign-ups, so the organizer can put his eighteen
 * names into the pool and the captains can draft from it. It does NOT generate
 * a schedule: the fixtures depend on who is drafted, and the playoff pairings
 * depend on week 1's results, so both are the organizer's to run when he is
 * ready.
 *
 * Created as a DRAFT and PRIVATE, exactly as the league wizard creates one.
 * Nothing is public until he publishes it.
 *
 * Re-runnable: if the slug already exists it reports and changes nothing,
 * rather than creating a second league of the same name.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

const ORG_SLUG = "mango-sports";
const NAME = "Mango Sports Friday Mens League";
const SLUG = "mango-sports-friday-mens-league";

// Friday. `weekly_slots.dayOfWeek` is 0=Sunday, and their Tuesday leagues
// carry 2, so Friday is 5.
const DAY_OF_WEEK = 5;
// 8pm, taken from the organizer's own description of the playoff night (semi
// 8-9, final 9-10). Week 1's six 20-minute games then run 8-10pm, so both
// weeks of a cycle finish at the same time.
const START_TIME = "20:00";
// One court: with three teams only one game can be on at a time.
const COURTS = 1;

const START_DATE = "2026-09-25"; // today, a Friday
const END_DATE = "2026-12-18"; // last Friday before Christmas; editable

// Matches both existing Mango leagues: one set to 25, win by 2.
const MATCH_FORMAT = { winBy: 2, bestOf: 1, setsToPoints: [25] };

async function main() {
  const [org] = await sql`
    select id, name from organizations where slug = ${ORG_SLUG}`;
  if (!org) {
    console.error(`no org with slug ${ORG_SLUG}`);
    process.exit(1);
  }
  console.log(`org: ${org.name}`);

  const [existing] = await sql`
    select id, name, status::text from competitions where slug = ${SLUG}`;
  if (existing) {
    console.log(
      `\nAlready exists — nothing changed.\n  ${existing.name} [${existing.status}]  id=${existing.id}`,
    );
    await sql.end();
    return;
  }

  const id = await sql.begin(async (tx) => {
    const [comp] = await tx`
      insert into competitions (
        org_id, slug, name, type, sport, status, visibility,
        start_date, end_date, venue, timezone, match_format,
        allow_individual_signups, max_individual_signups,
        allow_captain_entry, allow_ref_entry, allow_organizer_entry,
        require_confirmation
      ) values (
        ${org.id}, ${SLUG}, ${NAME}, 'league', 'indoor6', 'draft', 'private',
        ${START_DATE}, ${END_DATE}, 'Mango Sports', 'America/Toronto',
        -- sql.json, NOT JSON.stringify: postgres.js encodes a jsonb parameter
        -- itself, so a pre-stringified value is encoded twice and lands as a
        -- jsonb STRING scalar instead of an object. That broke the league page
        -- the first time this ran — see fix-mango-friday-json.ts.
        ${sql.json(MATCH_FORMAT)},
        true, 18,
        false, false, true,
        false
      )
      returning id`;

    await tx`
      insert into league_settings (
        competition_id, weekly_slots, rounds_per_team, games_per_team,
        games_per_week, minutes_per_game, session_nights, tiebreaker,
        pairing_order, court_list, blackout_dates, promotion_relegation
      ) values (
        ${comp.id},
        ${sql.json([
          { dayOfWeek: DAY_OF_WEEK, startTime: START_TIME, courts: COURTS },
        ])},
        -- Two full round robins between three teams is exactly the six games
        -- the organizer described, with each team playing the other two twice.
        2,
        null,
        -- Each team plays four of those six games on the night.
        4,
        20,
        -- Every 2nd played night is a playoff night: week 1 round robin,
        -- week 2 playoffs, repeating.
        2,
        -- Mango's stated preference, added at their request on 2026-09-23.
        'headToHead',
        'circle',
        null,
        null,
        false
      )`;

    return comp.id as string;
  });

  console.log(`\ncreated: ${NAME}`);
  console.log(`  id   = ${id}`);
  console.log(`  slug = ${SLUG}`);

  const [check] = await sql`
    select c.name, c.status::text, c.visibility::text, c.venue, c.timezone,
           c.allow_individual_signups, c.max_individual_signups,
           c.start_date, c.end_date,
           s.weekly_slots, s.rounds_per_team, s.games_per_week,
           s.minutes_per_game, s.session_nights, s.tiebreaker
      from competitions c
      join league_settings s on s.competition_id = c.id
     where c.id = ${id}`;
  console.log("\nread back:");
  for (const [k, v] of Object.entries(check)) {
    console.log(`  ${k} = ${JSON.stringify(v)}`);
  }

  console.log(
    "\nNo schedule generated — fixtures follow the draft, and the playoff follows week 1.",
  );
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
