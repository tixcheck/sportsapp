/**
 * Print SMVA's gym package from the LIVE database.
 *
 *   npx tsx lib/db/sheet-smva-package.ts
 *   npx tsx lib/db/sheet-smva-package.ts --week 1 --out ./out
 *
 * `scripts/smva-sample-sheet.ts` renders the same layout from hardcoded
 * literals — it was the sample sent to their executive before any of this was
 * in the database. This reads the real thing: the tiers, their gyms, the
 * seeded rosters, the 93 scheduled matches and the officials.
 *
 * THE GRID COMES FROM THE MATCHES, not from the pod template. The template is
 * still where the title, clock, scoring, points total and setup duty live —
 * those are properties of the format — but the fixtures, courts and times are
 * read back out of `matches`, so the sheet shows what is actually scheduled. If
 * somebody edits a match, the sheet says so rather than quietly reprinting the
 * template it was generated from.
 *
 * Slot times come from the template by round index, because a match row stores
 * only its start and the sheet prints a range ("7:20 - 7:50").
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { chromium } from "playwright";

import { noteLines, SMVA_SHEET_NOTES } from "@/lib/competition/sheet-notes";
import { resolvePlaceholders, type SheetTeam } from "@/lib/scheduler/gym-sheet";
import { movementLabel, podTemplate } from "@/lib/scheduler/pod-templates";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

const SLUG = "smva-monday-ladder-2026-2027";
const arg = (flag: string, fallback: string) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const WEEK = Number(arg("--week", "1"));
const OUT = arg("--out", ".");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface Fixture {
  court: string;
  home: string;
  away: string;
}
interface Slot {
  time: string;
  fixtures: Fixture[];
  sitting: string | null;
}
interface TierPage {
  name: string;
  venue: string;
  address: string;
  teams: SheetTeam[];
  slots: Slot[];
  title: string;
  clock: string;
  scoring: string;
  movement: string;
  setup: string;
  totalPoints: number;
  games: number;
  officials: string[];
}

/**
 * Games per match, derived rather than copied from the title.
 *
 * Every game is worth 2 points, so the total is `fixtures × games × 2`. A
 * template whose title and total disagree fails loudly here instead of
 * printing the wrong number of score boxes.
 */
function gamesPerMatch(title: string, fixtures: number, total: number): number {
  const games = total / (fixtures * 2);
  const printed = Number(/(\d+)-games per match/.exec(title)?.[1]);
  if (!Number.isInteger(games) || games !== printed) {
    throw new Error(
      `${title}: derived ${games} games/match but the title says ${printed}`,
    );
  }
  return games;
}

async function load(): Promise<{
  league: string;
  night: string;
  tiers: TierPage[];
}> {
  const [comp] = await sql`
    select id, name, timezone from competitions where slug = ${SLUG}`;
  if (!comp) throw new Error(`no league with slug "${SLUG}"`);

  const divs = await sql`
    select d.id, d.name, d.tier_order, v.name as venue, v.address
      from divisions d
      left join venues v on v.id = d.venue_id
     where d.competition_id = ${comp.id}
     order by d.tier_order`;

  const swaps = Array.from({ length: divs.length - 1 }, () => 2);
  const tiers: TierPage[] = [];
  let night = "";

  for (const [index, d] of divs.entries()) {
    const teamRows = await sql`
      select id, name, seed from teams
       where division_id = ${d.id} order by seed`;
    const teams: SheetTeam[] = teamRows.map((t) => ({
      id: t.id as string,
      name: t.name as string,
    }));

    const template = podTemplate(teams.length);
    if (!template) {
      throw new Error(`${d.name}: no pinned grid for ${teams.length} teams`);
    }

    const matchRows = await sql`
      select m.round, m.court, m.scheduled_at,
             h.name as home, a.name as away
        from matches m
        join teams h on h.id = m.home_team_id
        join teams a on a.id = m.away_team_id
       where m.division_id = ${d.id}
       order by m.round, m.court`;
    if (matchRows.length === 0) {
      throw new Error(`${d.name}: no matches — run smva-05-schedule first`);
    }

    // The night's date, taken from the fixtures rather than assumed.
    if (!night) {
      const at = matchRows[0].scheduled_at as Date;
      night = at.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: (comp.timezone as string) ?? "America/Toronto",
      });
    }

    const byRound = new Map<number, Fixture[]>();
    for (const m of matchRows) {
      const round = m.round as number;
      const list = byRound.get(round) ?? [];
      list.push({
        court: `Court ${m.court}`,
        home: m.home as string,
        away: m.away as string,
      });
      byRound.set(round, list);
    }

    const slots: Slot[] = [...byRound.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([round, fixtures]) => {
        const playing = new Set(fixtures.flatMap((f) => [f.home, f.away]));
        const out = teams.filter((t) => !playing.has(t.name));
        return {
          // A match stores one instant; the sheet prints a range, which only
          // the template knows.
          time: template.slots[round - 1]?.time ?? "",
          fixtures,
          sitting: out.length === 1 ? out[0].name : null,
        };
      });

    const byLetter = new Map(teams.map((t, i) => ["ABCDEFG"[i], t] as const));
    const duties = template.setup
      .map((s) => {
        const t = byLetter.get(s.letter);
        return t ? { name: t.name, court: s.court } : null;
      })
      .filter((x): x is { name: string; court: string } => x !== null);
    const setup =
      duties.length === 0
        ? ""
        : [
            `${duties[0].name} sets up ${duties[0].court}`,
            ...duties.slice(1).map((x) => `${x.name} ${x.court}`),
          ].join(", ");

    const [off] = await sql`
      select officials from ladder_night_officials
       where division_id = ${d.id} and week = ${WEEK}`;

    const fixtures = slots.reduce((n, s) => n + s.fixtures.length, 0);
    tiers.push({
      name: d.name as string,
      venue: (d.venue as string | null) ?? "",
      address: (d.address as string | null) ?? "",
      teams,
      slots,
      title: template.title,
      clock: template.clock,
      scoring: template.scoring,
      movement: movementLabel(index, swaps),
      setup,
      totalPoints: template.totalPoints,
      games: gamesPerMatch(template.title, fixtures, template.totalPoints),
      officials: ((off?.officials as string[] | undefined) ?? []).slice(),
    });
  }

  return { league: comp.name as string, night, tiers };
}

// ---------------------------------------------------------------------------
// Rendering — the same layout as the package their executive already has.
// ---------------------------------------------------------------------------

function scheduleRows(tier: TierPage): string {
  const boxes = Array.from(
    { length: tier.games },
    () => '<td class="box"></td>',
  ).join("");
  const rows: string[] = [];
  tier.slots.forEach((slot, slotIndex) => {
    slot.fixtures.forEach((f, i) => {
      const first = i === 0 && slotIndex > 0;
      rows.push(
        [
          `<tr${first ? ' class="slot-start"' : ""}>`,
          `<td class="time">${i === 0 ? esc(slot.time) : ""}</td>`,
          `<td class="court">${esc(f.court)}</td>`,
          `<td class="team right">${esc(f.home)}</td>`,
          boxes,
          '<td class="vs">v</td>',
          boxes,
          `<td class="team">${esc(f.away)}</td>`,
          "</tr>",
        ].join(""),
      );
      if (i === slot.fixtures.length - 1 && slot.sitting) {
        rows.push(
          `<tr class="sitting"><td></td><td></td><td colspan="${tier.games * 2 + 3}">` +
            `${esc(slot.sitting)} sits this round</td></tr>`,
        );
      }
    });
  });
  return rows.join("\n");
}

function officialsHtml(names: string[]): string {
  // Blank rules where the league has not named anyone — the gym writes them in.
  if (names.length === 0) {
    return [
      '<span class="rule">#1</span>',
      '<span class="rule">#2</span>',
      '<span class="rule">#3</span>',
    ].join("");
  }
  return names
    .map((n, i) => `<span class="ref">#${i + 1} ${esc(n)}</span>`)
    .join("");
}

function notesHtml(teams: SheetTeam[]): string {
  return SMVA_SHEET_NOTES.map((note) => {
    const lines = noteLines(note)
      .map((l) => `<li>${esc(resolvePlaceholders(l, teams))}</li>`)
      .join("");
    return [
      '<section class="note">',
      `<h3>${esc(resolvePlaceholders(note.title, teams))}</h3>`,
      `<ul>${lines}</ul>`,
      "</section>",
    ].join("");
  }).join("\n");
}

function tierPage(tier: TierPage, league: string, night: string): string {
  const headCols = Array.from(
    { length: tier.games },
    (_, i) => `<th class="box">G${i + 1}</th>`,
  ).join("");
  const resultRows = tier.teams
    .map(
      (t) =>
        `<tr><td class="team">${esc(t.name)}</td>` +
        '<td class="cell"><div class="box"></div></td>' +
        '<td class="cell"><div class="box"></div></td></tr>',
    )
    .join("\n");

  // A bye grid is nearly twice the rows: 21 fixtures plus a "sits" line each
  // slot against a six-team page's 15. At the normal row height Leacock spills
  // onto a second page, and the whole point is one sheet per gym.
  const fixtures = tier.slots.reduce((n, s) => n + s.fixtures.length, 0);
  const dense = fixtures + tier.slots.filter((s) => s.sitting).length > 18;

  return [
    `<article class="sheet${dense ? " dense" : ""}">`,
    '<header class="sheet-head"><div>',
    `<p class="league">${esc(league)}</p>`,
    `<h1>${esc(tier.name)}</h1>`,
    `<p class="venue">${esc(tier.venue)}${tier.address ? ` · ${esc(tier.address)}` : ""}</p>`,
    '</div><div class="when">',
    `<p class="week">Week ${WEEK}</p>`,
    `<p>${esc(night)}</p>`,
    `<p>First serve ${esc(tier.slots[0]?.time.split("-")[0].trim() ?? "")} PM</p>`,
    "</div></header>",

    '<div class="format">',
    `<div><span class="k">Format</span>${esc(tier.title)}</div>`,
    `<div><span class="k">Clock</span>${esc(tier.clock)}</div>`,
    `<div><span class="k">Points available</span>${tier.totalPoints}</div>`,
    `<div class="wide"><span class="k">Scoring</span>${esc(tier.scoring) || "—"}</div>`,
    `<div><span class="k">Movement</span>${esc(tier.movement) || "—"}</div>`,
    `<div class="wide"><span class="k">Court setup</span>${esc(tier.setup) || "—"}</div>`,
    "</div>",

    '<table class="schedule"><thead><tr>',
    '<th class="time">Time</th><th class="court">Court</th>',
    '<th class="team right">Home</th>',
    headCols,
    "<th></th>",
    headCols,
    '<th class="team">Away</th>',
    "</tr></thead><tbody>",
    scheduleRows(tier),
    "</tbody></table>",

    '<div class="footer-grid"><div>',
    "<h2>End of night</h2>",
    '<table class="results"><thead><tr>',
    '<th class="team">Team</th><th>Total points</th><th>Rank</th>',
    "</tr></thead><tbody>",
    resultRows,
    "</tbody></table>",
    '<p class="officials"><span class="k">Officials</span>',
    officialsHtml(tier.officials),
    "</p>",
    '</div><div class="notes">',
    notesHtml(tier.teams),
    "</div></div>",
    "</article>",
  ].join("\n");
}

function coverPage(league: string, night: string, tiers: TierPage[]): string {
  const teams = tiers.reduce((n, t) => n + t.teams.length, 0);
  const bottom = tiers.length;
  return [
    '<article class="sheet cover">',
    `<p class="league">${esc(league)}</p>`,
    '<h1 class="cover-title">Gym package</h1>',
    `<p class="cover-sub">Week ${WEEK} · ${esc(night)} · ${tiers.length} gyms</p>`,
    '<div class="cover-body">',

    "<p>Every page after this one is printed by the app from the league's own",
    "data — the tiers, the seeded rosters and the night's scheduled matches.",
    "The grids are the league's grids: the same matchups on the same courts in",
    "the same order, with the same clock, the same opening points and the same",
    "total.</p>",

    "<h3>What changes for the gym</h3>",
    "<p>Nothing. The sheet still goes to the gym, still gets filled in by hand,",
    "and still comes back to the executive over WhatsApp.</p>",

    "<h3>What changes for the executive</h3>",
    `<p>One line per team instead of ${teams}. At the end of the night the only`,
    "entry is each team's <strong>total points</strong> and <strong>rank</strong>",
    "— the two columns already on the sheet. The app moves the ladder from the",
    "ranks, works out the next week's tiers, and prints the next package.",
    "Per-match scores can be entered, but are not required.</p>",

    "<h3>Team names, not letters</h3>",
    '<p>The paper sheet says "A vs C" with a legend because nobody can rewrite',
    "six team names into a printed grid by hand every week. That constraint is",
    "gone, so the names are printed directly. The letters still exist",
    'underneath — they are what the duty lines key off, so "Team D" still',
    "lands on the fourth seed.</p>",

    "<h3>Overall standings</h3>",
    `<p>Position across all ${teams} teams, lowest total winning: first in`,
    `Tier 1 scores 1, last in Tier ${bottom} scores ${teams}. Totals over`,
    "different numbers of played nights are reported with the night count",
    "beside them, so they are never silently compared.</p>",

    "</div></article>",
  ].join("\n");
}

const CSS = `
:root {
  --ink: #12161c;
  --muted: #5b6675;
  --line: #c9d0d9;
  --rule: #8b95a3;
  --accent: #1d3f6e;
  --band: #eef2f7;
}
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0;
  color: var(--ink);
  background: #fff;
  font: 10.5px/1.45 "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-variant-numeric: tabular-nums;
}
@page { size: Letter portrait; margin: 12mm 11mm; }

.sheet { page-break-after: always; }
.sheet:last-child { page-break-after: auto; }

.sheet-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--accent);
}
.league {
  margin: 0; font-size: 8.5px; letter-spacing: .13em; text-transform: uppercase;
  color: var(--muted);
}
h1 { margin: 2px 0 1px; font-size: 21px; letter-spacing: -.01em; color: var(--accent); }
.venue { margin: 0; color: var(--muted); font-size: 10px; }
.when { text-align: right; white-space: nowrap; }
.when p { margin: 0; font-size: 10px; color: var(--muted); }
.when .week {
  font-size: 13px; font-weight: 700; color: var(--ink); letter-spacing: .02em;
}

.format {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px 18px;
  margin: 9px 0 11px; padding: 8px 10px; background: var(--band);
  border-radius: 3px; font-size: 10px;
}
.format .wide { grid-column: span 2; }
.k {
  display: inline-block; min-width: 86px; padding-right: 8px;
  font-size: 8.5px; letter-spacing: .1em;
  text-transform: uppercase; color: var(--muted);
}

table { width: 100%; border-collapse: collapse; }
.schedule th {
  font-size: 8.5px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--muted); font-weight: 600; text-align: left;
  padding: 0 4px 4px; border-bottom: 1px solid var(--line);
}
.schedule td { padding: 3.5px 4px; border-bottom: 1px solid var(--line); }
.schedule tr.slot-start td { border-top: 1.5px solid var(--rule); }
.time { width: 74px; font-weight: 700; white-space: nowrap; }
.court { width: 50px; color: var(--muted); }
.team { font-weight: 600; }
.right { text-align: right; }
.vs { width: 14px; text-align: center; color: var(--muted); font-size: 9px; }
th.box { text-align: center; width: 26px; }
.schedule td.box {
  width: 26px; height: 18px; padding: 0;
  border: 1px solid var(--rule);
}
.sitting td { font-size: 9px; color: var(--muted); font-style: italic; }

.footer-grid {
  display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px; margin-top: 12px;
}
h2 {
  margin: 0 0 5px; font-size: 9px; letter-spacing: .12em; text-transform: uppercase;
  color: var(--accent);
}
.results th {
  font-size: 8.5px; letter-spacing: .06em; text-transform: uppercase;
  color: var(--muted); font-weight: 600; text-align: center;
  padding: 0 4px 3px; border-bottom: 1px solid var(--line);
}
.results th.team { text-align: left; }
.results td { padding: 3px 4px; border-bottom: 1px solid var(--line); }
.results td.cell { width: 62px; }
.results .box { height: 15px; border: 1px solid var(--rule); border-radius: 2px; }
.officials { margin: 9px 0 0; font-size: 10px; }
.rule {
  display: inline-block; width: 70px; margin-right: 7px;
  border-bottom: 1px solid var(--rule); color: var(--muted); font-size: 9px;
}
.ref { display: inline-block; margin-right: 12px; font-size: 9.5px; }

.notes { font-size: 9px; }
.note { break-inside: avoid; margin-bottom: 7px; }
.note h3 {
  margin: 0 0 2px; font-size: 8.5px; letter-spacing: .09em;
  text-transform: uppercase; color: var(--accent);
}
.note ul { margin: 0; padding-left: 13px; }
.note li { margin-bottom: 1px; }

/* A seven-team gym prints 28 rows where a six-team gym prints 15. Squeeze the
   row height rather than the type: the names and the score boxes are what the
   gym writes in, so they stay legible while the whitespace goes. */
.dense .schedule td { padding: 1.4px 4px; }
.dense .schedule td.box { height: 13px; }
.dense .sitting td { font-size: 8px; }
.dense .results td { padding: 1.4px 4px; }
.dense .results .box { height: 12px; }
.dense .footer-grid { gap: 14px; margin-top: 8px; }
.dense .notes { font-size: 8.2px; }
.dense .format { margin: 7px 0 8px; padding: 6px 10px; }

.cover { padding-top: 6mm; }
.cover-title { font-size: 34px; margin: 4px 0 2px; }
.cover-sub { margin: 0 0 20px; color: var(--muted); font-size: 12px; }
.cover-body { max-width: 62ch; font-size: 11px; line-height: 1.6; }
.cover-body p { margin: 0 0 12px; }
.cover-body h3 {
  margin: 18px 0 5px; font-size: 9px; letter-spacing: .12em;
  text-transform: uppercase; color: var(--accent);
}
`;

async function main() {
  const { league, night, tiers } = await load();

  const html = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>SMVA gym package — week ${WEEK}</title>`,
    `<style>${CSS}</style>`,
    "</head>",
    "<body>",
    [
      coverPage(league, night, tiers),
      ...tiers.map((t) => tierPage(t, league, night)),
    ].join("\n"),
    "</body>",
    "</html>",
  ].join("\n");

  mkdirSync(OUT, { recursive: true });
  const htmlFile = join(OUT, `smva-gym-package-week${WEEK}.html`);
  const pdfFile = join(OUT, `smva-gym-package-week${WEEK}.pdf`);
  writeFileSync(htmlFile, html, "utf8");

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
      path: pdfFile,
      format: "Letter",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "11mm", right: "11mm" },
    });
  } finally {
    await browser.close();
  }

  console.log(`${league}\n  week ${WEEK} · ${night}\n`);
  for (const t of tiers) {
    const fixtures = t.slots.reduce((n, s) => n + s.fixtures.length, 0);
    console.log(
      `  ${t.name.padEnd(20)} ${t.teams.length} teams · ${fixtures} matches · ` +
        `${t.officials.length} officials`,
    );
  }
  console.log(`\n  ${htmlFile}`);
  console.log(`  ${pdfFile}`);

  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
