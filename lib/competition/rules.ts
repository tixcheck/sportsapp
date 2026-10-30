/**
 * A league's own rules: what players see on its Rules tab, and what the Help
 * assistant answers rule questions from.
 *
 * Big Shoots asked for this on 2026-10-29. Their rules sheet is mostly CHANGES
 * from the standard game ("What it was / What it is now / In short"), plus a
 * few house rules for their gym's ceiling, so a section has those parts and
 * every one of them is optional. A section with a "What it was" is an update;
 * one without is a standing rule, and the tab groups them that way.
 *
 * Plain text throughout, like every other organizer-authored field in v0. In a
 * body, a line starting "- " is a bullet, "  - " a bullet under it, and "1. " a
 * numbered step.
 *
 * Pure: no DB, no React.
 */

export interface RuleDetail {
  /** "Example", "Setter faults", "Play continues if"… */
  label: string;
  text: string;
}

export interface RuleSection {
  title: string;
  /** Marked "House rule": specific to this league or gym. */
  houseRule: boolean;
  /** A line under the title, e.g. why the house rule exists. */
  note: string;
  /** The old rule. Present = this section is an update. */
  was: string;
  /** The rule as it stands. */
  now: string;
  details: RuleDetail[];
  /** The one-line summary players remember. */
  inShort: string;
}

export const RULE_LIMITS = {
  sections: 40,
  details: 6,
  title: 100,
  label: 40,
  text: 3000,
  inShort: 400,
} as const;

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/**
 * Read whatever is in the jsonb column, dropping anything unusable. Same
 * stance as `parseSheetNotes`: a malformed section is dropped, not repaired.
 */
export function parseRules(raw: unknown): RuleSection[] {
  if (!Array.isArray(raw)) return [];
  const out: RuleSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const details: RuleDetail[] = [];
    if (Array.isArray(r.details)) {
      for (const d of r.details) {
        if (!d || typeof d !== "object") continue;
        const dd = d as Record<string, unknown>;
        const label = str(dd.label, RULE_LIMITS.label);
        const text = str(dd.text, RULE_LIMITS.text);
        if (text) details.push({ label, text });
        if (details.length >= RULE_LIMITS.details) break;
      }
    }
    const section: RuleSection = {
      title: str(r.title, RULE_LIMITS.title),
      houseRule: r.houseRule === true,
      note: str(r.note, RULE_LIMITS.inShort),
      was: str(r.was, RULE_LIMITS.text),
      now: str(r.now, RULE_LIMITS.text),
      details,
      inShort: str(r.inShort, RULE_LIMITS.inShort),
    };
    // A title with nothing under it says nothing; a body without a title has
    // no heading for players to find it by.
    if (!section.title) continue;
    if (!section.was && !section.now && !details.length && !section.inShort)
      continue;
    out.push(section);
    if (out.length >= RULE_LIMITS.sections) break;
  }
  return out;
}

export const isUpdate = (s: RuleSection) => s.was !== "";

export type RuleLine =
  | { kind: "text"; text: string }
  | { kind: "bullet"; text: string; depth: 0 | 1 }
  | { kind: "step"; n: number; text: string };

/** A body as the lines the tab renders. */
export function ruleLines(body: string): RuleLine[] {
  const out: RuleLine[] = [];
  for (const raw of body.split("\n")) {
    if (!raw.trim()) continue;
    const bullet = /^(\s*)[-•*]\s+(.*)$/.exec(raw);
    if (bullet) {
      out.push({
        kind: "bullet",
        text: bullet[2].trim(),
        depth: bullet[1].length >= 2 ? 1 : 0,
      });
      continue;
    }
    const step = /^\s*(\d+)[.)]\s+(.*)$/.exec(raw);
    if (step) {
      out.push({ kind: "step", n: Number(step[1]), text: step[2].trim() });
      continue;
    }
    out.push({ kind: "text", text: raw.trim() });
  }
  return out;
}

/**
 * The rules as plain text for the Help assistant: every part labelled the way
 * the tab labels it, so an answer can quote the tab word for word.
 */
export function rulesAsText(leagueName: string, rules: RuleSection[]): string {
  const parts = [`League: ${leagueName}`];
  for (const s of rules) {
    const lines = [
      `## ${s.title}${s.houseRule ? " (house rule)" : ""}${isUpdate(s) ? " (rule update)" : ""}`,
    ];
    if (s.note) lines.push(s.note);
    if (s.was) lines.push(`What it was: ${s.was}`);
    if (s.now) lines.push(`${s.was ? "What it is now" : "Rule"}: ${s.now}`);
    for (const d of s.details)
      lines.push(d.label ? `${d.label}: ${d.text}` : d.text);
    if (s.inShort) lines.push(`In short: ${s.inShort}`);
    parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}
