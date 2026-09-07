/**
 * Splitting a waiver into the clauses a signer initials one at a time.
 *
 * Pure: no DB, no browser. The same function runs when the signing screen is
 * drawn and again on the server when the signature is recorded, so the count
 * of clauses the person initialled cannot drift from the count we verify.
 *
 * DETECTION IS CONSERVATIVE ON PURPOSE. A waiver whose structure we misread is
 * worse than one we don't split at all: initials against the wrong headings
 * are evidence of nothing, and would be produced silently. So a document only
 * counts as structured when it looks unambiguously like a numbered agreement —
 * headings numbered from 1, in order, each on its own short line. Anything
 * else is treated as one undivided document and signed the way it always was.
 */

export type WaiverClause = {
  /** 1-based, as printed in the document. */
  number: number;
  heading: string;
  body: string;
};

export type WaiverStructure = {
  /** Everything before clause 1 — the warning and the "in consideration of". */
  preamble: string;
  clauses: WaiverClause[];
};

/** A heading line: "3. WAIVER AND RELEASE OF LIABILITY". */
const HEADING = /^(\d{1,2})\.[ \t]+(\S.{0,79})$/;

/**
 * Two is the minimum that means anything. A single "1." is a numbered list
 * that happens to start at one, not a structured agreement.
 */
const MIN_CLAUSES = 2;

export function splitWaiverClauses(body: string): WaiverStructure {
  const lines = body.replace(/\r\n/g, "\n").split("\n");

  const marks: { line: number; number: number; heading: string }[] = [];
  lines.forEach((line, i) => {
    const m = HEADING.exec(line.trim());
    if (m) {
      marks.push({ line: i, number: Number(m[1]), heading: m[2].trim() });
    }
  });

  // Numbered from 1, ascending, no gaps. A document that skips from 2 to 7 is
  // one we have misread — most likely prose containing "1979. " or a price.
  const sequential =
    marks.length >= MIN_CLAUSES &&
    marks.every((mark, i) => mark.number === i + 1);

  if (!sequential) {
    return { preamble: body.trim(), clauses: [] };
  }

  const preamble = lines.slice(0, marks[0].line).join("\n").trim();

  const clauses = marks.map((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].line : lines.length;
    return {
      number: mark.number,
      heading: mark.heading,
      body: lines
        .slice(mark.line + 1, end)
        .join("\n")
        .trim(),
    };
  });

  return { preamble, clauses };
}

/**
 * The initials to offer, derived from a typed name.
 *
 * "Priya Sharma" → "PS". Offered as a starting point and editable, because a
 * legal name doesn't always produce the initials somebody actually uses, and
 * because the value has to be theirs rather than ours.
 */
export function initialsFrom(name: string): string {
  return name
    .split(/[\s'-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .slice(0, 4)
    .join("");
}

/** Signature styles offered at the end. Values are stored, so never renamed. */
export const SIGNATURE_STYLES = ["flowing", "formal", "casual"] as const;
export type SignatureStyle = (typeof SIGNATURE_STYLES)[number];

export function isSignatureStyle(value: string): value is SignatureStyle {
  return (SIGNATURE_STYLES as readonly string[]).includes(value);
}

/**
 * Whether a set of initials covers every clause.
 *
 * Checked on the server as well as in the form: the point of initialling each
 * clause is that the record shows they did, and a record assembled from
 * whatever the browser posted would show only that the browser said so.
 */
export function missingInitials(
  clauses: WaiverClause[],
  initials: Record<string, string>,
): number[] {
  return clauses
    .filter((c) => (initials[String(c.number)] ?? "").trim() === "")
    .map((c) => c.number);
}
