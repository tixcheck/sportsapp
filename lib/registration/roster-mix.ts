/**
 * How a team's roster splits across the answers to one multiple-choice
 * question.
 *
 * Brampton runs co-ed leagues and needs to see, per team, how many players of
 * each sex are on it — a team that turns up four men and no women cannot field
 * a legal lineup, and the organizer would rather know in September than on the
 * night. They already ask it: a required per-player "Gender" question with
 * Male / Female / Non-Binary.
 *
 * So this deliberately does NOT look for a question about sex. It tallies ANY
 * per-player multiple-choice question, and the organizer reads the one they
 * care about. Guessing from a label — matching "gender" or "sex" — would break
 * the day a league words it differently, and would quietly summarise the wrong
 * question rather than failing visibly. As a side effect Brampton also gets
 * their Skill level split, which is the other thing they balance teams on.
 *
 * Pure: no DB.
 */

export type ChoiceCount = {
  label: string;
  n: number;
  /**
   * Whether this is one of the question's declared options. False means an
   * answer given before the organizer edited the choices — kept and shown,
   * because silently dropping somebody's answer would make the totals lie.
   */
  expected: boolean;
};

export type ChoiceTally = {
  /** Declared options first, in the organizer's order, then any strays. */
  counts: ChoiceCount[];
  /**
   * Players with no answer. Its own figure, never folded into a choice: a
   * player who hasn't answered has not said anything, and a tally that treats
   * silence as an answer is exactly what an organizer must not act on.
   */
  unanswered: number;
  /** Roster size — the sum of every count and `unanswered`. */
  total: number;
};

/**
 * Tally one roster's answers against a question's options.
 *
 * `answers` has one entry per rostered player, in roster order, with null or
 * an empty string for anyone who has not answered.
 */
export function tallyChoices(
  answers: (string | null | undefined)[],
  options: string[],
): ChoiceTally {
  const declared = options.map((o) => o.trim()).filter(Boolean);
  // Matching is case- and space-insensitive so "female" counts as "Female";
  // the DECLARED spelling is what gets displayed.
  const canonical = new Map(declared.map((o) => [o.toLowerCase(), o]));

  const counts = new Map<string, number>(declared.map((o) => [o, 0]));
  const strays = new Map<string, number>();
  let unanswered = 0;

  for (const raw of answers) {
    const value = (raw ?? "").trim();
    if (!value) {
      unanswered += 1;
      continue;
    }
    const known = canonical.get(value.toLowerCase());
    if (known) {
      counts.set(known, (counts.get(known) ?? 0) + 1);
    } else {
      strays.set(value, (strays.get(value) ?? 0) + 1);
    }
  }

  return {
    counts: [
      ...declared.map((label) => ({
        label,
        n: counts.get(label) ?? 0,
        expected: true,
      })),
      // Alphabetical, since there is no organizer-declared order to follow.
      ...[...strays.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, n]) => ({ label, n, expected: false })),
    ],
    unanswered,
    total: answers.length,
  };
}

/** Column headings for a table of several teams — every label that appears. */
export function choiceColumns(
  tallies: ChoiceTally[],
  options: string[],
): string[] {
  const declared = options.map((o) => o.trim()).filter(Boolean);
  const extra = new Set<string>();
  for (const t of tallies) {
    for (const c of t.counts) {
      // A stray with no answers behind it is noise, not a column.
      if (!c.expected && c.n > 0) extra.add(c.label);
    }
  }
  return [...declared, ...[...extra].sort((a, b) => a.localeCompare(b))];
}

/** One row's number under a column heading. */
export function countFor(tally: ChoiceTally, label: string): number {
  return tally.counts.find((c) => c.label === label)?.n ?? 0;
}
