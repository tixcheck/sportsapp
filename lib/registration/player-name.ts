/**
 * The name to show an organizer for a player.
 *
 * Two names exist for the same person and they are not interchangeable:
 *
 *   `users.display_name` is the ACCOUNT name — what teammates and the public
 *   see. "Sharon V." and "Steve" are deliberate: since migration 0077 a player
 *   chooses how they appear, and a league has no business overwriting that.
 *
 *   The First/Last name ANSWERS are what the league asked for and the player
 *   gave it. An organizer chasing a waiver, checking a roster or exporting a
 *   list wants this one — "Rob" is not enough to tell two Robs apart.
 *
 * So organizer-only surfaces resolve through here; anything a teammate or the
 * public can see keeps `display_name` untouched.
 *
 * MATCHED BY LABEL, the same deliberate compromise as
 * `suggested_player_answers` (migration 0106). There is no "name" question
 * kind — First name and Last name are an editable starter preset, plain short
 * text like any other question — so the wording is all there is to go on. The
 * match is EXACT after normalising, so "Last name of emergency contact" does
 * not match, and a league that renames the field simply falls back to the
 * account name. That is today's behaviour, which makes it the safe direction
 * to fail.
 *
 * Pure: no DB.
 */

/** Lowercase, trimmed, inner runs of space collapsed, trailing colon dropped. */
function normalize(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[:*]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const FIRST = new Set([
  "first name",
  "firstname",
  "first",
  "given name",
  "givenname",
  "forename",
]);

const LAST = new Set([
  "last name",
  "lastname",
  "last",
  "surname",
  "family name",
  "familyname",
]);

export function isFirstNameLabel(label: string): boolean {
  return FIRST.has(normalize(label));
}

export function isLastNameLabel(label: string): boolean {
  return LAST.has(normalize(label));
}

/**
 * Whether an account name already reads as a full name.
 *
 * Two or more words, the last of which is not an initial. "Rob" and
 * "Sharon V." are not complete; "Rachel da Cunha" and "Kelly A Walker" are —
 * a middle initial is fine, a trailing one is the abbreviation this is looking
 * for.
 *
 * This is the guard that stops the fix becoming a different bug. The answers
 * are what the player typed into a form, in whatever case they typed it, so
 * preferring them wholesale rewrote "Rachel da Cunha" as "RACHEL DA CUNHA" and
 * dropped the middle name from "Bobbi Lynn Brake". A name that is already
 * complete is left exactly as it is; names are not a thing to restyle
 * algorithmically, and every rule for doing it breaks on VanEerden, McCormack
 * or da Cunha.
 */
export function looksComplete(displayName: string): boolean {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  const last = words[words.length - 1];
  return !/^\p{L}\.?$/u.test(last);
}

export type PlayerNameParts = {
  /** The First name answer, if the competition asks and they answered. */
  first?: string | null;
  /** The Last name answer. */
  last?: string | null;
  /** `users.display_name`. */
  displayName?: string | null;
  email?: string | null;
};

/**
 * The best name for an organizer's list.
 *
 * It FILLS IN, it does not overrule. The answers are used only when they
 * carry a surname AND the account name is missing or abbreviated — which is
 * the complaint this exists to fix, a list reading "Rob" and "Sharon V.".
 * An account name that is already a full name is left alone, because the
 * answers are free text and using them wholesale trades one wrong name for
 * another.
 *
 * Returns "—" rather than an empty string: a blank cell in a list of people
 * reads as a rendering fault.
 */
export function resolvePlayerName(parts: PlayerNameParts): string {
  const first = (parts.first ?? "").trim();
  const last = (parts.last ?? "").trim();
  const display = (parts.displayName ?? "").trim();
  const email = (parts.email ?? "").trim();

  if (last && !looksComplete(display)) {
    return [first, last].filter(Boolean).join(" ");
  }
  return (
    display ||
    (last ? [first, last].filter(Boolean).join(" ") : first) ||
    email ||
    "—"
  );
}

/**
 * Whether a signature is worth showing beside the name on file.
 *
 * A waiver records `signed_name` — what the person typed into the signature
 * box — and that is a third thing, neither the account name nor the
 * registration answers. It is frozen evidence and must never be rewritten to
 * agree with them.
 *
 * Most signatures match the name on file, so printing both on every row would
 * be the same name twice and would bury the one row where they genuinely
 * differ. Case and spacing are ignored: "Sarah logozzo" against "Sarah
 * Logozzo" is the same person signing their own name, not a discrepancy an
 * organizer needs to look at.
 */
export function signatureWorthShowing(
  nameOnFile: string,
  signedName: string | null | undefined,
): boolean {
  const signed = (signedName ?? "").trim();
  if (!signed) return false;
  const flatten = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
  return flatten(signed) !== flatten(nameOnFile);
}

/**
 * Whether resolving changed anything — for a UI that wants to say so.
 *
 * Kept separate from `resolvePlayerName` so the resolution itself stays a
 * single expression with no reporting mixed into it.
 */
export function nameCameFromAnswers(parts: PlayerNameParts): boolean {
  return (
    (parts.last ?? "").trim().length > 0 &&
    !looksComplete((parts.displayName ?? "").trim())
  );
}
