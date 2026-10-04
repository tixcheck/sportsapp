/**
 * Print SMVA's gym package from the LIVE database.
 *
 *   npx tsx lib/db/sheet-smva-package.ts
 *   npx tsx lib/db/sheet-smva-package.ts --week 1 --out ./out
 *
 * `scripts/smva-sample-sheet.ts` renders the same layout from hardcoded
 * literals — it was the sample sent to their executive before any of this was
 * in the database. This reads the real thing: the tiers, their gyms, each
 * tier's seated order for the week (its `ladder_placements`), that week's
 * matches and the officials. Any week prints: `--week 2` after week 1 is locked
 * and week 2 drawn.
 *
 * THE GRID COMES FROM THE MATCHES, not from the pod template. The template is
 * still where the title, clock, scoring, points total and setup duty live —
 * those are properties of the format — but the fixtures, courts and times are
 * read back out of `matches`, so the sheet shows what is actually scheduled. If
 * somebody edits a match, the sheet says so rather than quietly reprinting the
 * template it was generated from.
 *
 * `matches.round` is the WEEK. The slot within the night is read from start
 * times in order, and indexes the template's printed range ("7:20 - 7:50"),
 * because a match row stores only its start.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { chromium } from "playwright";
import { DateTime } from "luxon";

import { noteLines, SMVA_SHEET_NOTES } from "@/lib/competition/sheet-notes";
import type { SheetTeam } from "@/lib/scheduler/gym-sheet";
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
  /** "A and B and E" — who sets up courts, as the gym sheet words it. */
  setupLetters: string;
  courtLabels: string[];
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
    // The week's seated order: A is whoever sits first in the tier THAT week,
    // which after a lock is last week's result, not the season's seeding.
    // Seeds are the fallback only for a week with no placements yet.
    const placed = await sql`
      select t.id, t.name from ladder_placements p
        join teams t on t.id = p.team_id
       where p.division_id = ${d.id} and p.week = ${WEEK}
       order by p.position`;
    const teamRows =
      placed.length > 0
        ? placed
        : await sql`
            select id, name from teams
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
       where m.division_id = ${d.id} and m.round = ${WEEK}
       order by m.scheduled_at, m.court`;
    if (matchRows.length === 0) {
      throw new Error(
        `${d.name}: no week ${WEEK} matches — draw the week first`,
      );
    }

    // The night's date, taken from the fixtures rather than assumed.
    if (!night) {
      const at = matchRows[0].scheduled_at as Date;
      // Their sheet's own format: "Monday, September 28, 2026".
      night = DateTime.fromJSDate(at, {
        zone: (comp.timezone as string) ?? "America/Toronto",
      }).toFormat("cccc, LLLL dd, yyyy");
    }

    // `round` is the WEEK; the slot within the night is the start time, and
    // its place in the night's order indexes the template's printed range.
    const slotOf = new Map<number, number>();
    for (const m of matchRows) {
      const t = (m.scheduled_at as Date).getTime();
      if (!slotOf.has(t)) slotOf.set(t, slotOf.size + 1);
    }
    const byRound = new Map<number, Fixture[]>();
    for (const m of matchRows) {
      const round = slotOf.get((m.scheduled_at as Date).getTime())!;
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
      setupLetters: template.setup.map((x) => x.letter).join(" and "),
      courtLabels: template.courtLabels,
    });
  }

  return { league: comp.name as string, night, tiers };
}

// ---------------------------------------------------------------------------
// Rendering — THEIR sheet, as printed on Mon 28 Sep 2026 (Leacock).
//
// The organizer, 2026-10-04: the print-out should be "exactly how this sheet
// is", so the gym sees no change. An earlier layout printed names in a fixture
// list with per-game boxes and a cover page explaining it; it was the app's
// idea of a better sheet, and the executive's test has always been whether the
// app prints THEIR sheet. So: title and gym, the four coloured instruction
// blocks, the letter schedule with movement and setup beside it, the A–F
// cross-table with Running Totals / Total Points / 1st, 2nd / a grey "Do not
// write" column and an arrow column, then the three officials with signature
// lines. Letters, not names, in the schedule — the cross-table is the legend.
// ---------------------------------------------------------------------------

const LETTERS = "ABCDEFG";

/** "Tier 2 — Leacock" → "Leacock": the sheet heads each page with the gym. */
function gymName(tierName: string): string {
  return tierName.includes("—") ? tierName.split("—").pop()!.trim() : tierName;
}

/** Their colours, block by block, in the order SMVA_SHEET_NOTES lists them. */
const NOTE_STYLE = [
  { head: "orange", body: "orange" },
  { head: "navy", body: "black" },
  { head: "red", body: "red" },
  { head: "red", body: "black" },
];

function notesHtml(): string {
  return SMVA_SHEET_NOTES.map((note, i) => {
    const style = NOTE_STYLE[i] ?? { head: "navy", body: "black" };
    // The sheet prints the letter ("Team D"), not the team's name.
    const title = note.title.replace(/\{([A-G])\}/g, "$1");
    const lines = noteLines(note)
      .map((l) => `<p>${esc(l.replace(/\{([A-G])\}/g, "$1"))}</p>`)
      .join("");
    return (
      `<div class="note"><h3 class="${style.head}">${esc(title)}</h3>` +
      `<div class="lines ${style.body}">${lines}</div></div>`
    );
  }).join("\n");
}

function scheduleTable(tier: TierPage): string {
  const letterOf = new Map(tier.teams.map((t, i) => [t.name, LETTERS[i]]));
  const courts = tier.courtLabels;
  const anySitting = tier.slots.some((s) => s.sitting);
  const cols = courts.length + 2 + (anySitting ? 1 : 0);
  const rows = tier.slots
    .map((slot) => {
      const cells = courts.map((label) => {
        const f = slot.fixtures.find((x) => x.court === label);
        return `<td>${f ? `${letterOf.get(f.home)} VS ${letterOf.get(f.away)}` : ""}</td>`;
      });
      const sits = anySitting
        ? `<td>${slot.sitting ? letterOf.get(slot.sitting) : ""}</td>`
        : "";
      return `<tr><td class="t">${esc(slot.time)}</td><td></td>${cells.join("")}${sits}</tr>`;
    })
    .join("\n");
  return [
    '<table class="sched">',
    `<tr><th colspan="${cols}" class="title">${esc(tier.title)}</th></tr>`,
    `<tr><th class="t">Time</th><th></th>${courts.map((c) => `<th>${esc(c)}</th>`).join("")}${anySitting ? "<th>Sits</th>" : ""}</tr>`,
    rows,
    `<tr><th colspan="${cols}">${esc(tier.clock)}</th></tr>`,
    tier.scoring
      ? `<tr><th colspan="${cols}">${esc(tier.scoring)}</th></tr>`
      : "",
    "</table>",
  ].join("\n");
}

/** A cell crossed corner to corner, like the sheet's diagonal. */
const CROSS =
  '<td class="x"><svg viewBox="0 0 10 10" preserveAspectRatio="none">' +
  '<line x1="0" y1="0" x2="10" y2="10"/><line x1="10" y1="0" x2="0" y2="10"/>' +
  "</svg></td>";

function crossTable(tier: TierPage): string {
  const n = tier.teams.length;
  const letters = LETTERS.slice(0, n).split("");
  const head = [
    '<tr class="h1">',
    '<th rowspan="2" class="l"></th><th rowspan="2" class="team">Team</th>',
    ...letters.map((l) => `<th rowspan="2" class="sq">${l}</th>`),
    '<th rowspan="2" class="run">Running Totals</th>',
    '<th colspan="2" class="eon">End of Night Results</th>',
    '<th rowspan="2" class="nw">Do not write in this column</th>',
    '<th rowspan="2" class="arrow"></th>',
    "</tr>",
    '<tr class="h2"><th class="pts">Total Points</th><th class="pts">1st, 2nd, etc</th></tr>',
  ].join("");
  const body = tier.teams
    .map((t, r) => {
      const cells = letters.map((_, c) =>
        c === r ? CROSS : '<td class="sq"></td>',
      );
      return (
        `<tr><td class="l">${LETTERS[r]}</td><td class="team">${esc(t.name)}</td>` +
        cells.join("") +
        '<td class="run"></td><td class="pts"></td><td class="pts"></td>' +
        '<td class="nw"></td><td class="arrow"></td></tr>'
      );
    })
    .join("\n");
  return `<table class="cross">${head}\n${body}</table>`;
}

function officialsHtml(names: string[]): string {
  return [0, 1, 2]
    .map(
      (i) =>
        `<div class="off"><span class="num">#${i + 1}</span>` +
        `<span class="name">${esc(names[i] ?? "")}</span>` +
        '<span class="sign"></span></div>',
    )
    .join("\n");
}

function tierPage(tier: TierPage, night: string): string {
  return [
    '<article class="sheet">',
    `<h1>${esc(night)}</h1>`,
    `<h2>${esc(gymName(tier.name))}</h2>`,
    `<section class="notes">${notesHtml()}</section>`,
    '<div class="sched-row">',
    scheduleTable(tier),
    '<div class="aside">',
    tier.movement ? `<p>${esc(tier.movement)}</p>` : "",
    tier.setupLetters ? `<p>${esc(tier.setupLetters)} setup courts</p>` : "",
    "</div></div>",
    crossTable(tier),
    `<section class="officials">${officialsHtml(tier.officials)}</section>`,
    "</article>",
  ].join("\n");
}

const CSS = `
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: #000; background: #fff;
  font: 10.5px/1.25 Arial, Helvetica, sans-serif; }
@page { size: Letter portrait; margin: 9mm 10mm; }
.sheet { page-break-after: always; }
.sheet:last-child { page-break-after: auto; }

h1, h2 { margin: 0; text-align: center; font-size: 17px; font-weight: 700; }
h2 { margin-bottom: 8px; }

.notes { margin: 0 0 10px; }
.note h3 { margin: 2px 0 1px; font-size: 11px; font-weight: 700;
  text-decoration: underline; }
.note .lines { margin-left: 1.55in; font-size: 11px; font-weight: 700; }
.note .lines p { margin: 0 0 1px; }
.orange { color: #d9541e; }
.navy { color: #1f3864; }
.red { color: #c00000; }
.black { color: #000; }

.sched-row { display: flex; gap: 22px; align-items: flex-start;
  margin: 0 0 6px 0.32in; }
.sched { border-collapse: collapse; width: 4.95in; font-size: 12px; }
.sched th, .sched td { border: 1.3px solid #000; padding: 1px 4px;
  text-align: left; white-space: nowrap; }
.sched th { font-weight: 700; text-align: center; }
.sched th.title, .sched th.t, .sched td.t { text-align: left; }
.sched tr:nth-child(2) th { text-align: left; }
.sched td { font-weight: 700; }
.sched td:nth-child(2), .sched th:nth-child(2) { width: 0.62in; }
.aside p { margin: 0 0 18px; font-size: 13px; }

.cross { border-collapse: collapse; width: 100%; margin-top: 4px; }
.cross th, .cross td { border: 1.5px solid #000; text-align: center;
  padding: 0; }
.cross th { font-size: 10.5px; font-weight: 400; }
.cross tr.h1 th, .cross tr.h2 th { height: 0.3in; }
.cross td { height: 0.47in; font-size: 11.5px; }
.cross .l { width: 0.5in; }
.cross .team { width: 1.35in; }
.cross td.team { font-size: 10.5px; padding: 0 3px; }
.cross .sq { width: 0.5in; }
.cross .run { width: 1.85in; }
.cross .eon { font-size: 9px; }
.cross .pts { width: 0.62in; font-size: 9.5px; }
.cross .nw { width: 0.52in; font-size: 8.5px; line-height: 1.05; }
.cross td.nw { background: #a6a6a6; }
.cross .arrow { width: 0.5in; }
.cross td.x { position: relative; }
.cross td.x svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.cross td.x line { stroke: #000; stroke-width: 1.6; vector-effect: non-scaling-stroke; }

.officials { margin-top: 14px; width: 100%; }
.off { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 8px; }
.off .num { width: 0.3in; font-size: 13px; font-weight: 700; text-align: right; }
.off .name { width: 3.05in; height: 0.27in; border: 1.3px solid #000;
  padding: 2px 4px; font-size: 12px; }
.off .sign { flex: 1; margin-left: 0.9in; border-bottom: 1.3px solid #000;
  height: 0.27in; }
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
    [...tiers.map((t) => tierPage(t, night))].join("\n"),
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
      margin: { top: "9mm", bottom: "9mm", left: "10mm", right: "10mm" },
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
