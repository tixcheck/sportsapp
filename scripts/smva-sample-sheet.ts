/**
 * Render Scarborough's gym package — the sample we send them.
 *
 * Not a test fixture and not the shippable print route: this is the artefact
 * their executive is actually shown, built from exactly the data the app runs
 * on (`pod-templates`, `gym-sheet`, `sheet-notes`, the real 2026/27 roster) so
 * that "the app prints the same sheet" is demonstrable rather than claimed.
 *
 * It earns its place in the repo because rendering is what catches what unit
 * tests cannot. 29 tests passed while `resolveDuty` was turning the organizer's
 * "A 4-minute warning" into "VOID 4-minute warning"; printing one page found it
 * in seconds.
 *
 *   npx tsx scripts/smva-sample-sheet.ts            # writes the HTML
 *   npx tsx scripts/smva-sample-sheet.ts --out DIR
 *
 * Turn it into a PDF with headless Chrome's --print-to-pdf.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { noteLines, SMVA_SHEET_NOTES } from "@/lib/competition/sheet-notes";
import {
  buildGymSheet,
  resolvePlaceholders,
  type GymSheet,
  type SheetTeam,
} from "@/lib/scheduler/gym-sheet";
import { movementLabel } from "@/lib/scheduler/pod-templates";

// ---------------------------------------------------------------------------
// The night being printed.
// ---------------------------------------------------------------------------

/** Week 1 is draft night, so the first sheet a gym sees is week 2. */
const WEEK = 2;
const NIGHT = "Monday, 28 September 2026";
const LEAGUE = "SMVA Monday Night Ladder 2026/2027";

/** Two exchanged at every boundary — seven boundaries for eight tiers. */
const SWAPS = [2, 2, 2, 2, 2, 2, 2];

interface Tier {
  name: string;
  venue: string;
  address: string;
  teams: string[];
}

const TIERS: Tier[] = [
  {
    name: "Tier 1 — Bethune",
    venue: "Dr. Norman Bethune CI",
    address: "200 Fundy Bay Blvd, Scarborough",
    teams: [
      "VOID",
      "ONE PUNCH",
      "EMPIRE SPIKES BACK",
      "MESLA CONSTRUCTION",
      "DAZED AND CONFUSED",
      "JUMBO SHRIMP",
    ],
  },
  {
    name: "Tier 2A — Leacock A",
    venue: "Stephen Leacock CI — Gym A",
    address: "2450 Birchmount Rd, Scarborough",
    teams: ["THE FACTORY", "SUNDAY KNIGHTS", "SVEIKS", "INVICTUS"],
  },
  {
    name: "Tier 2B — Leacock B",
    venue: "Stephen Leacock CI — Gym B",
    address: "2450 Birchmount Rd, Scarborough",
    teams: ["CONNEX", "HYDRATION NATION", "MISFITS", "BIG D BOYS"],
  },
  {
    name: "Tier 3 — Agincourt",
    venue: "Agincourt CI",
    address: "2621 Midland Ave, Scarborough",
    teams: [
      "RONIN",
      "BEST BUDS",
      "TRUE NORTH VOLLEYBALL",
      "TRAFFIC",
      "BEERS",
      "BANGERS AND SMASH",
    ],
  },
  {
    name: "Tier 4 — PPL",
    venue: "Père-Philippe-Lamarche",
    address: "2850 Eglinton Ave E, Scarborough",
    teams: ["UNITED", "BLUFFS 2.0", "SMASHED", "OGE", "CHEFS", "OUTTAHAND"],
  },
  {
    name: "Tier 5A — Porter",
    venue: "SATEC @ W. A. Porter CI",
    address: "40 Fairfax Crescent, Scarborough",
    teams: ["B.O.M.B.", "TGS", "KATZ", "ZEUS"],
  },
  {
    name: "Tier 5B — Wexford",
    venue: "Wexford CS for the Arts",
    address: "1176 Pharmacy Ave, Scarborough",
    teams: ["BOUNCETOWN", "INSIDERS", "GIANT CROWS", "DEATH FROM ABOVE"],
  },
  {
    name: "Tier 6 — King",
    venue: "R.H. King Academy",
    address: "3800 St Clair Ave E, Scarborough",
    teams: [
      "BIG DIG ENERGY",
      "GOONIES",
      "KILLER HITMEN",
      "TORONTO WARRIORS",
      "COBRAS",
      "SCREAMING EAGLES",
    ],
  },
];

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Games in each match, derived rather than copied out of the title.
 *
 * Every game is worth 2 points, so the sheet's own Total Points is
 * `fixtures × games × 2` — which is how the 5- and 7-team totals were worked
 * out instead of invented. Deriving it here means a template whose title and
 * total disagree fails loudly rather than printing the wrong number of score
 * boxes.
 */
function gamesPerMatch(sheet: GymSheet): number {
  const fixtures = sheet.slots.reduce((n, s) => n + s.fixtures.length, 0);
  const games = sheet.totalPoints / (fixtures * 2);
  const printed = Number(/(\d+)-games per match/.exec(sheet.title)?.[1]);
  if (!Number.isInteger(games) || games !== printed) {
    throw new Error(
      `${sheet.title}: derived ${games} games/match but the title says ${printed}`,
    );
  }
  return games;
}

function scheduleRows(sheet: GymSheet, games: number): string {
  const boxes = Array.from(
    { length: games },
    () => '<td class="box"></td>',
  ).join("");
  const rows: string[] = [];
  sheet.slots.forEach((slot, slotIndex) => {
    slot.fixtures.forEach((f, i) => {
      const first = i === 0 && slotIndex > 0;
      rows.push(
        [
          `<tr${first ? ' class="slot-start"' : ""}>`,
          `<td class="time">${i === 0 ? esc(slot.time) : ""}</td>`,
          `<td class="court">${esc(f.court)}</td>`,
          `<td class="team right">${esc(f.home.name)}</td>`,
          boxes,
          '<td class="vs">v</td>',
          boxes,
          `<td class="team">${esc(f.away.name)}</td>`,
          "</tr>",
        ].join(""),
      );
      if (i === slot.fixtures.length - 1 && slot.sitting) {
        rows.push(
          `<tr class="sitting"><td></td><td></td><td colspan="${games * 2 + 3}">` +
            `${esc(slot.sitting.name)} sits this round</td></tr>`,
        );
      }
    });
  });
  return rows.join("\n");
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

function tierPage(tier: Tier, index: number): string {
  const teams: SheetTeam[] = tier.teams.map((name) => ({ id: name, name }));
  const sheet = buildGymSheet(teams, movementLabel(index, SWAPS));
  if (!sheet) throw new Error(`no pinned grid for ${tier.teams.length} teams`);
  const games = gamesPerMatch(sheet);
  const headCols = Array.from(
    { length: games },
    (_, i) => `<th class="box">G${i + 1}</th>`,
  ).join("");
  const resultRows = sheet.teams
    .map(
      (t) =>
        `<tr><td class="team">${esc(t.name)}</td>` +
        '<td class="cell"><div class="box"></div></td>' +
        '<td class="cell"><div class="box"></div></td></tr>',
    )
    .join("\n");

  return [
    '<article class="sheet">',
    '<header class="sheet-head"><div>',
    `<p class="league">${esc(LEAGUE)}</p>`,
    `<h1>${esc(tier.name)}</h1>`,
    `<p class="venue">${esc(tier.venue)} · ${esc(tier.address)}</p>`,
    '</div><div class="when">',
    `<p class="week">Week ${WEEK}</p>`,
    `<p>${esc(NIGHT)}</p>`,
    "<p>First serve 7:20 PM</p>",
    "</div></header>",

    '<div class="format">',
    `<div><span class="k">Format</span>${esc(sheet.title)}</div>`,
    `<div><span class="k">Clock</span>${esc(sheet.clock)}</div>`,
    `<div><span class="k">Points available</span>${sheet.totalPoints}</div>`,
    `<div class="wide"><span class="k">Scoring</span>${esc(sheet.scoring)}</div>`,
    `<div><span class="k">Movement</span>${esc(sheet.movement) || "—"}</div>`,
    `<div class="wide"><span class="k">Court setup</span>${esc(sheet.setup) || "—"}</div>`,
    "</div>",

    '<table class="schedule"><thead><tr>',
    '<th class="time">Time</th><th class="court">Court</th>',
    '<th class="team right">Home</th>',
    headCols,
    "<th></th>",
    headCols,
    '<th class="team">Away</th>',
    "</tr></thead><tbody>",
    scheduleRows(sheet, games),
    "</tbody></table>",

    '<div class="footer-grid"><div>',
    "<h2>End of night</h2>",
    '<table class="results"><thead><tr>',
    '<th class="team">Team</th><th>Total points</th><th>Rank</th>',
    "</tr></thead><tbody>",
    resultRows,
    "</tbody></table>",
    '<p class="officials"><span class="k">Officials</span>',
    '<span class="rule">#1</span><span class="rule">#2</span><span class="rule">#3</span></p>',
    '</div><div class="notes">',
    notesHtml(teams),
    "</div></div>",
    "</article>",
  ].join("\n");
}

function coverPage(): string {
  return [
    '<article class="sheet cover">',
    `<p class="league">${esc(LEAGUE)}</p>`,
    '<h1 class="cover-title">Gym package</h1>',
    `<p class="cover-sub">Week ${WEEK} · ${esc(NIGHT)} · eight gyms</p>`,
    '<div class="cover-body">',

    "<p>Every page after this one is printed by the app from the league's own",
    "data. The grids are the league's grids, transcribed: the same matchups on",
    "the same courts in the same order, with the same clock, the same opening",
    "points and the same total. Nothing here is generated or re-ordered.</p>",

    "<h3>What changes for the gym</h3>",
    "<p>Nothing. The sheet still goes to the gym, still gets filled in by hand,",
    "and still comes back to the executive over WhatsApp.</p>",

    "<h3>What changes for the executive</h3>",
    "<p>One line per team instead of forty. At the end of the night the only",
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
    "<p>Position across all 40 teams, lowest total winning: first in Tier 1",
    "scores 1, last in Tier 6 scores 40. Totals over different numbers of",
    "played nights are reported with the night count beside them, so they are",
    "never silently compared.</p>",

    "<h3>Still to confirm with the league</h3>",
    "<ul>",
    "<li>Bethune and King printed the same fifteen 6-team fixtures with slots 3",
    "and 5 exchanged. Bethune is followed here, being the sheet given as",
    "canonical.</li>",
    "<li>OUTTAHAND is placed at PPL. The 13 April sheet was an adjusted night",
    "(Agincourt ran 7, PPL ran 5) and OUTTAHAND was listed last of the seven,",
    "which makes it the likeliest visitor — but it is an inference.</li>",
    "<li>A 5- and 7-team grid exists for nights a gym falls through. The",
    "scoring line on the 5-team grid is borrowed from the 6-team one, because",
    "the source sheet printed a clock but no scoring note.</li>",
    "</ul>",

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
/* padding-right, not just min-width: "Points available" is wider than the
   track, and without it the number butts straight against the label. */
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
.sitting td {
  font-size: 9px; color: var(--muted); font-style: italic;
}

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
.results .box {
  height: 15px; border: 1px solid var(--rule); border-radius: 2px;
}
.officials { margin: 9px 0 0; font-size: 10px; }
.rule {
  display: inline-block; width: 70px; margin-right: 7px;
  border-bottom: 1px solid var(--rule); color: var(--muted); font-size: 9px;
}

.notes { font-size: 9px; }
.note { break-inside: avoid; margin-bottom: 7px; }
.note h3 {
  margin: 0 0 2px; font-size: 8.5px; letter-spacing: .09em;
  text-transform: uppercase; color: var(--accent);
}
.note ul { margin: 0; padding-left: 13px; }
.note li { margin-bottom: 1px; }

.cover { padding-top: 6mm; }
.cover-title { font-size: 34px; margin: 4px 0 2px; }
.cover-sub { margin: 0 0 20px; color: var(--muted); font-size: 12px; }
.cover-body { max-width: 62ch; font-size: 11px; line-height: 1.6; }
.cover-body p { margin: 0 0 12px; }
.cover-body h3 {
  margin: 18px 0 5px; font-size: 9px; letter-spacing: .12em;
  text-transform: uppercase; color: var(--accent);
}
.cover-body ul { margin: 0; padding-left: 16px; }
.cover-body li { margin-bottom: 5px; }
`;

function render(): string {
  const pages = [coverPage(), ...TIERS.map(tierPage)].join("\n");
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>SMVA gym package — week ${WEEK}</title>`,
    `<style>${CSS}</style>`,
    "</head>",
    "<body>",
    pages,
    "</body>",
    "</html>",
  ].join("\n");
}

const outFlag = process.argv.indexOf("--out");
const dir = outFlag > -1 ? process.argv[outFlag + 1] : ".";
mkdirSync(dir, { recursive: true });
const file = join(dir, "smva-gym-package.html");
writeFileSync(file, render(), "utf8");
console.log(`wrote ${file}`);
console.log(`${TIERS.length} tiers + cover`);
