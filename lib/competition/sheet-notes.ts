/**
 * The standing instructions printed on every score sheet.
 *
 * Most of Scarborough's gym package is not the schedule — it is text that says
 * what the winning team does with the nets, who sets the clock, and that an
 * unfinished first game becomes a single-game match. Their executive's test for
 * the app is whether it prints the same sheet, so text that never appears is a
 * feature that does not exist.
 *
 * Titled blocks rather than one field, because the sheet prints them as headed
 * sections. Plain text throughout, like every other organizer-authored field in
 * v0; blank lines separate paragraphs.
 *
 * Pure: no DB, no React.
 */

export interface SheetNote {
  title: string;
  body: string;
}

const MAX_SECTIONS = 12;
const MAX_TITLE = 80;
const MAX_BODY = 2000;

/**
 * Read whatever is in the jsonb column, discarding anything malformed.
 *
 * Organizer-authored JSON that has been through a column, an API and a form is
 * not to be trusted into a print layout — a missing `title` would render a
 * headless block and a non-string `body` would throw mid-page. Anything that
 * is not a usable section is dropped rather than repaired, because a silently
 * repaired instruction is worse than an absent one.
 */
export function parseSheetNotes(raw: unknown): SheetNote[] {
  if (!Array.isArray(raw)) return [];
  const out: SheetNote[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { title, body } = item as { title?: unknown; body?: unknown };
    if (typeof title !== "string" || typeof body !== "string") continue;
    const t = title.trim();
    const b = body.trim();
    // A section with neither a heading nor anything under it prints as a gap.
    if (!t && !b) continue;
    out.push({ title: t.slice(0, MAX_TITLE), body: b.slice(0, MAX_BODY) });
    if (out.length >= MAX_SECTIONS) break;
  }
  return out;
}

/** Drop empties and trim, ready to store. Same rules as reading. */
export function normalizeSheetNotes(notes: SheetNote[]): SheetNote[] {
  return parseSheetNotes(notes);
}

/** Body text as the lines a sheet prints — one per bullet. */
export function noteLines(note: SheetNote): string[] {
  return note.body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Scarborough's own sections, transcribed from their sheet.
 *
 * Offered as a starting point rather than baked in: every word of this is
 * theirs, and another league printing sheets will want entirely different text.
 * "Team {D}" uses a placeholder, not a bare letter: the renderer substitutes
 * the fourth seed's name. Bare letters cannot be used in prose — "A 4-minute
 * warning" would have its article replaced with a team name, which is exactly
 * what the first sample sheet did.
 */
export const SMVA_SHEET_NOTES: SheetNote[] = [
  {
    title: "Team Responsibilities",
    body: [
      "Ensure the End of Night (total Points, Ranking) are completed and verified",
      "Ensure the score of each match is recorded. If no score is marked a zero will be assumed",
      "Once sheet is handed in it will be considered final. No changes will be made",
    ].join("\n"),
  },
  {
    title: "General responsibilities",
    body: [
      "No matter when a match begins, it is to end at the scheduled time.",
      "A 4-minute warning will be given: an unfinished first game becomes a single-game match.",
      "Take only 1 minute to change courts and begin the next match. NO EXTRA WARMUPS PLEASE",
      "Winner of the first game of the last match takes down and stores the nets.",
    ].join("\n"),
  },
  {
    title: "Team {D} responsibilities",
    body: [
      "Sets clock and coordinates continuation by captains",
      "Final cleanup and lockup",
      "Print gym package (this score sheet) and bring to the gym",
    ].join("\n"),
  },
  {
    title: "Winning team responsibilities",
    body: "Winner of the tier is responsible for returning the completed score sheet to the league executive via WhatsApp. Please make sure any notes on the front or back of the sheet are included.",
  },
];
