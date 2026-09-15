/**
 * Set up Big Shoots in its organizer's own org, copied from the Test Org league.
 *
 * Liam ran his league inside Test Org while it was being tried out: settings,
 * four drafted teams, 27 sign-ups. He now has his own organization, and the
 * league belongs there. This recreates it rather than moving it — the Test Org
 * copy keeps its practice schedule, one score and 72 lineup rows as a sandbox,
 * and the real league starts clean.
 *
 *   npx tsx lib/db/setup-big-shoots.ts           # dry run, changes nothing
 *   npx tsx lib/db/setup-big-shoots.ts --write
 *
 * READ FROM THE SOURCE, not retyped. Every flag, the description and every
 * player comes out of the live Test Org rows at run time, so "the same features
 * as the test league" is a copy, not a transcription that could drift. Only the
 * things the organizer asked to change are set here:
 *
 *   - each game is 2 sets to 25, capped at 27
 *   - first serve 6:45 PM, Fridays, 3 rounds a night
 *   - season runs Friday 18 September 2026 to Friday 14 May 2027
 *
 * THE SEASON IS A CHAIN OF THREE-WEEK SESSIONS. The same drafted teams play
 * three Fridays together — two regular nights, then a playoff night — and then
 * everyone is re-drafted onto Team 1–4. With four teams and three rounds a
 * night, every Friday is one complete round robin, so the playoff night is the
 * same fixtures as any other: the team with the most wins THAT NIGHT takes the
 * session, and if two are level on wins, the one that scored more points that
 * night wins it (the organizer's rule, 2026-09-15). The standings already show
 * each night's won/lost/tied, which is where that is read.
 *
 * NO SCHEDULE. Matches are generated from the app once this has been checked.
 *
 * Converges rather than duplicating: the league is matched by name within the
 * org, teams by name within the league, sign-ups by name within the league.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

import { slugify, uniqueSlug } from "../utils/slug";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const WRITE = process.argv.includes("--write");

/** Big Shoots Men's Volleyball — created by Liam on 2026-09-14. */
const ORG_ID = "7ba804ce-a223-475a-80dd-48f7492f6078";
/** The league he has been running inside Test Org. */
const SOURCE_ID = "ede313f8-b580-4bbc-a0f9-0b29208f1e72";
/** liamjohnson934@gmail.com — the org's owner. */
const LIAM_USER_ID = "a27c4055-834d-401f-9030-cc5174dad74f";

const START_DATE = "2026-09-18";
/**
 * The playoff night of the last COMPLETE session in May. Every Friday from
 * 18 Sep to the end of May, less the two holidays, is 35 nights: eleven whole
 * sessions (33 nights) and two left over. The organizer chose to end on a full
 * session rather than play a short one, so 21 and 28 May are not scheduled.
 */
const END_DATE = "2027-05-14";
/**
 * Christmas and New Year's Day both fall on a Friday this season. The
 * generator moves a blacked-out night to the next Friday rather than dropping
 * it, so every later session shifts back two weeks — which is what lands the
 * eleventh playoff on 14 May. Good Friday (26 Mar) is played.
 */
const BLACKOUT_DATES = ["2026-12-25", "2027-01-01"];
/**
 * One full round robin per night. The generator does not read `end_date` at
 * all — it keeps playing weekly until it runs out of rounds — so this count,
 * not the date, is what makes the season last until May. With four teams a
 * round robin is three rounds, and `games_per_week` is three, so each unit
 * here is exactly one Friday: 11 sessions × 3 nights = 33.
 */
const NIGHTS = 33;
const START_TIME = "18:45";
/** 0 = Sunday … 6 = Saturday. 18 Sep 2026 is a Friday. */
const FRIDAY = 5;

/** "2 sets to 25, 27 cap" — a fixed two-set game; 1–1 is a legal result. */
const MATCH_FORMAT = {
  bestOf: 2,
  setsToPoints: [25, 25],
  winBy: 2,
  capPoints: 27,
};

const say = (s: string) => console.log(s);

async function main() {
  say(WRITE ? "WRITING.\n" : "DRY RUN — nothing is saved. Add --write.\n");

  const [org] =
    await sql`select id, name from organizations where id = ${ORG_ID}`;
  if (!org) throw new Error("Liam's organization was not found.");
  const [src] = await sql`select * from competitions where id = ${SOURCE_ID}`;
  const [srcSettings] = await sql`
    select * from league_settings where competition_id = ${SOURCE_ID}`;
  if (!src || !srcSettings) throw new Error("Source league not found.");
  say(`org:    ${org.name}`);
  say(`source: ${src.name} (Test Org)\n`);

  // --- venue ------------------------------------------------------------
  // Venues are org-scoped, so the Test Org row cannot be shared. Copied
  // field for field, since it already carries the address Google resolved.
  const [srcVenue] = await sql`
    select * from venues
    where org_id = ${src.org_id} and name ilike '%holody%'`;
  if (!srcVenue) throw new Error("Holody venue not found in Test Org.");

  let venueId: string;
  const [haveVenue] = await sql`
    select id from venues where org_id = ${ORG_ID} and name = ${srcVenue.name}`;
  if (haveVenue) {
    venueId = haveVenue.id as string;
    say(`venue    exists   ${srcVenue.name}`);
  } else if (!WRITE) {
    venueId = "<new:venue>";
    say(`venue    CREATE   ${srcVenue.name} — ${srcVenue.address}`);
  } else {
    const [row] = await sql`
      insert into venues (org_id, name, address, entry_notes, doors_note)
      values (${ORG_ID}, ${srcVenue.name}, ${srcVenue.address},
              ${srcVenue.entry_notes}, ${srcVenue.doors_note})
      returning id`;
    venueId = row.id as string;
    say(`venue    created  ${srcVenue.name}`);
  }

  // --- competition --------------------------------------------------------
  let compId: string;
  const [haveComp] = await sql`
    select id, slug from competitions
    where org_id = ${ORG_ID} and name = ${src.name}`;

  // Everything the organizer did NOT ask to change, straight off the source.
  const copied = {
    type: src.type,
    sport: src.sport,
    visibility: src.visibility,
    timezone: src.timezone,
    venue: src.venue,
    description: src.description,
    banner_url: src.banner_url,
    allow_captain_entry: src.allow_captain_entry,
    allow_ref_entry: src.allow_ref_entry,
    allow_organizer_entry: src.allow_organizer_entry,
    require_confirmation: src.require_confirmation,
    allow_individual_signups: src.allow_individual_signups,
    waitlist_claim_hours: src.waitlist_claim_hours,
    track_appearances: src.track_appearances,
    platform_fee_waived: src.platform_fee_waived,
    min_roster_for_entry: src.min_roster_for_entry,
    max_individual_signups: src.max_individual_signups,
    waiver_require_initials: src.waiver_require_initials,
    home_locality: src.home_locality,
    bracket_reseed_seeds: src.bracket_reseed_seeds,
  };

  if (haveComp) {
    compId = haveComp.id as string;
    say(`\nleague   exists   ${src.name} (/${haveComp.slug})`);
    if (WRITE) {
      await sql`
        update competitions set
          ${sql(copied as never)},
          start_date = ${START_DATE}, end_date = ${END_DATE},
          start_time = ${START_TIME},
          match_format = ${sql.json(MATCH_FORMAT as never)}
        where id = ${compId}`;
      say(`         converged to the source settings`);
    }
  } else {
    const base = slugify(src.name as string);
    const taken = await sql`
      select slug from competitions
      where slug = ${base} or slug like ${base + "-%"}`;
    const slug = uniqueSlug(base, new Set(taken.map((r) => r.slug as string)));

    if (!WRITE) {
      compId = "<new:league>";
      say(`\nleague   CREATE   ${src.name}  (/l/${slug})`);
    } else {
      const [row] = await sql`
        insert into competitions ${sql({
          ...copied,
          org_id: ORG_ID,
          slug,
          name: src.name,
          // Unpublished until it has been checked — see the file header.
          status: "draft",
          start_date: START_DATE,
          end_date: END_DATE,
          start_time: START_TIME,
          end_time: null,
          waiver_id: null,
          // In the insert itself: the column is NOT NULL, so setting it in a
          // follow-up update fails before the row exists.
          match_format: sql.json(MATCH_FORMAT as never),
        } as never)}
        returning id`;
      compId = row.id as string;
      say(`\nleague   created  ${src.name}  (/l/${slug})`);
    }
  }
  say(
    `         ${START_DATE} → ${END_DATE}, Fridays ${START_TIME}, America/Toronto`,
  );
  say(
    `         games: 2 sets to 25, cap 27 · track_appearances=${src.track_appearances} · individual sign-ups=${src.allow_individual_signups}`,
  );

  // --- league settings ----------------------------------------------------
  const courts = (
    (srcSettings.court_list as { label: string; prime: boolean }[] | null) ?? []
  ).map((c) => ({ label: c.label, prime: c.prime, venueId }));
  const slots = [
    {
      dayOfWeek: FRIDAY,
      startTime: START_TIME,
      courts: courts.length || 2,
      venueId,
    },
  ];
  const settings = {
    competition_id: compId,
    weekly_slots: sql.json(slots as never),
    court_list: sql.json(courts as never),
    rounds_per_team: NIGHTS,
    games_per_week: srcSettings.games_per_week,
    games_per_team: srcSettings.games_per_team,
    minutes_per_game: srcSettings.minutes_per_game,
    tiebreaker: srcSettings.tiebreaker,
    pairing_order: srcSettings.pairing_order,
    blackout_dates: BLACKOUT_DATES,
    promotion_relegation: srcSettings.promotion_relegation,
    registration_open: srcSettings.registration_open,
    registration_deadline: null,
    max_teams: srcSettings.max_teams,
    ladder_enabled: srcSettings.ladder_enabled,
    ladder_unit: srcSettings.ladder_unit,
    ladder_target: srcSettings.ladder_target,
    ladder_swaps: srcSettings.ladder_swaps,
    sheet_notes: srcSettings.sheet_notes,
  };
  say(
    `settings ${WRITE ? "written " : "WRITE   "} rounds/team=${settings.rounds_per_team} games/week=${settings.games_per_week} ` +
      `(= ${settings.rounds_per_team} Fridays, one full round robin each, blackouts ${BLACKOUT_DATES.join(" & ")}) · ${courts.length} courts · ` +
      `${settings.pairing_order} pairing · ${settings.tiebreaker} · max ${settings.max_teams} teams · registration_open=${settings.registration_open}`,
  );
  if (WRITE) {
    await sql`
      insert into league_settings ${sql(settings as never)}
      on conflict (competition_id) do update set
        weekly_slots = excluded.weekly_slots,
        court_list = excluded.court_list,
        rounds_per_team = excluded.rounds_per_team,
        blackout_dates = excluded.blackout_dates,
        games_per_week = excluded.games_per_week,
        games_per_team = excluded.games_per_team,
        minutes_per_game = excluded.minutes_per_game,
        tiebreaker = excluded.tiebreaker,
        pairing_order = excluded.pairing_order,
        registration_open = excluded.registration_open,
        max_teams = excluded.max_teams`;
  }

  // --- teams ----------------------------------------------------------------
  const srcTeams = await sql`
    select id, name, status from teams
    where competition_id = ${SOURCE_ID} and status <> 'withdrawn'
    order by name`;
  const teamFor = new Map<string, string>(); // source team id -> new team id
  say("");
  for (const t of srcTeams) {
    const [have] = compId.startsWith("<")
      ? [undefined]
      : await sql`
          select id from teams where competition_id = ${compId} and name = ${t.name}`;
    if (have) {
      teamFor.set(t.id as string, have.id as string);
      say(`team     exists   ${t.name}`);
    } else if (!WRITE) {
      teamFor.set(t.id as string, `<new:${t.name}>`);
      say(`team     CREATE   ${t.name}`);
    } else {
      const [row] = await sql`
        insert into teams (competition_id, name, status)
        values (${compId}, ${t.name}, ${t.status})
        returning id`;
      teamFor.set(t.id as string, row.id as string);
      say(`team     created  ${t.name}`);
    }
  }

  // --- players and the draft ------------------------------------------------
  // Placement is copied as the draft's saved result: `placed` plus the team.
  // That is all `place_free_agents` ever records — there is no separate lock.
  const srcAgents = await sql`
    select * from free_agents
    where competition_id = ${SOURCE_ID} and status <> 'withdrawn'
    order by placed_team_id nulls last, name`;
  let placed = 0;
  let pool = 0;
  say("");
  for (const fa of srcAgents) {
    const teamId = fa.placed_team_id
      ? (teamFor.get(fa.placed_team_id as string) ?? null)
      : null;
    // The drafted "Liam Johnson" is the org's owner. Linking the sign-up to
    // his account means his lineups and stats follow him from night one,
    // rather than splitting him into a name now and an account later.
    const userId = fa.name === "Liam Johnson" ? LIAM_USER_ID : fa.user_id;
    const teamName = srcTeams.find((t) => t.id === fa.placed_team_id)?.name;
    if (teamId) placed += 1;
    else pool += 1;

    const [have] = compId.startsWith("<")
      ? [undefined]
      : await sql`
          select id from free_agents
          where competition_id = ${compId} and name = ${fa.name}`;
    const label = `${String(fa.name).padEnd(18)} ${teamName ? `→ ${teamName}` : "  available"}${userId === LIAM_USER_ID ? "  (linked to Liam's account)" : ""}`;

    if (!WRITE) {
      say(`player   ${have ? "exists " : "CREATE "}  ${label}`);
      continue;
    }
    const row = {
      competition_id: compId,
      user_id: userId,
      name: fa.name,
      email: fa.email,
      phone: fa.phone,
      positions: sql.array((fa.positions as string[]) ?? []),
      skill_level: fa.skill_level,
      notes: fa.notes,
      status: teamId ? "placed" : fa.status,
      placed_team_id: teamId,
      draft_rank: fa.draft_rank,
    };
    if (have) {
      await sql`update free_agents set ${sql(row as never)}, updated_at = now() where id = ${have.id}`;
    } else {
      await sql`insert into free_agents ${sql(row as never)}`;
    }
    // An account on a team is a `team_members` row too — the same write
    // `place_free_agents` makes for a player who has one.
    if (userId && teamId) {
      await sql`
        insert into team_members (team_id, user_id, role)
        values (${teamId}, ${userId}, 'player')
        on conflict (team_id, user_id) do nothing`;
    }
    say(`player   saved    ${label}`);
  }
  say(
    `\n${srcAgents.length} players: ${placed} drafted onto ${srcTeams.length} teams, ${pool} left available.`,
  );
  say(
    WRITE
      ? "\nDone. No schedule was created."
      : "\nDry run complete. Re-run with --write.",
  );
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
