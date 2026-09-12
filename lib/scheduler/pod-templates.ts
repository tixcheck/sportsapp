/**
 * Fixed pod schedules — the night's grid, written down rather than generated.
 *
 * Scarborough Men's does not want a schedule computed. Their 4-team and 6-team
 * grids are the same every week and have been for years: the same matchups, on
 * the same courts, in the same order, with the same clock. The organizer was
 * explicit that it "has to be this". A generator that produced an equivalent
 * but differently-ordered round robin would be wrong even though the fixtures
 * matched, because the sheet is what the gym runs off and the executive's whole
 * objection to new systems is that they change things.
 *
 * So this is data, not an algorithm. Teams are referred to by LETTER exactly as
 * the sheet does; the letters are bound to real teams at render time.
 *
 * Only 4 and 6 are pinned here. Their five other pod sizes appear when a gym
 * falls through and teams are shuffled — the April 13 sheet had a 5 and a 7 for
 * exactly that reason — and those grids are not yet confirmed as canonical.
 */

export type PodLetter = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export interface PodSlot {
  /** As printed: "7:20 - 7:50". */
  time: string;
  /** One entry per court, in court order. Null where that court sits idle. */
  courts: ({ home: PodLetter; away: PodLetter } | null)[];
  /** The letter sitting this slot out, for pods that have one. */
  sitting?: PodLetter;
}

export type PodKind =
  /** Runs every normal week: 3 courts = 6 teams, 2 courts = 4 teams. */
  | "regular"
  /** Only when a gym falls through and teams are rebalanced across the rest. */
  | "adjustment";

export interface PodTemplate {
  teams: number;
  kind: PodKind;
  /** Court headings as printed, e.g. ["Court 1", "Court 2", "Court 3"]. */
  courtLabels: string[];
  slots: PodSlot[];
  /** "6-Team Schedule: 2-games per match" */
  title: string;
  /** "Set clock at 26 minutes +4 minutes" */
  clock: string;
  /** "First games start at 4 points" */
  scoring: string;
  /** "A and B and E setup courts". Empty where the source sheet printed none. */
  setup: string;
  /** The number printed under the grid — total points available on the night. */
  totalPoints: number;
}

const m = (home: PodLetter, away: PodLetter) => ({ home, away });

/**
 * 4 teams, 2 courts, 3 games per match.
 *
 * Every pairing once, and A plays on Court 1 all night — which is why the
 * grid cannot be reordered: the sheet's duty lines ("A and B setup courts")
 * assume it.
 */
const POD_4: PodTemplate = {
  teams: 4,
  kind: "regular",
  title: "4-Team Schedule: 3-games per match",
  courtLabels: ["Court 1", "Court 2"],
  slots: [
    { time: "7:20 - 8:10", courts: [m("A", "C"), m("B", "D")] },
    { time: "8:12 - 9:00", courts: [m("A", "D"), m("B", "C")] },
    { time: "9:02 - 9:50", courts: [m("A", "B"), m("C", "D")] },
  ],
  clock: "Set clock at 45 minutes +4 minutes",
  scoring: "Games 1&2 start at 4 points, Game 3 at 0",
  setup: "A and B setup courts",
  totalPoints: 36,
};

/**
 * 6 teams, 3 courts, 2 games per match.
 *
 * Transcribed from Bethune, which the organizer gave as the canonical grid.
 * The King sheet on the same night carries the same fifteen fixtures with
 * slots 3 and 5 exchanged — worth resolving with them, but Bethune is the one
 * to follow until they say otherwise.
 */
const POD_6: PodTemplate = {
  teams: 6,
  kind: "regular",
  title: "6-Team Schedule: 2-games per match",
  courtLabels: ["Court 1", "Court 2", "Court 3"],
  slots: [
    { time: "7:20 - 7:50", courts: [m("B", "D"), m("E", "F"), m("A", "C")] },
    { time: "7:52 - 8:20", courts: [m("A", "F"), m("E", "B"), m("D", "C")] },
    { time: "8:22 - 8:50", courts: [m("D", "E"), m("C", "F"), m("A", "B")] },
    { time: "8:52 - 9:20", courts: [m("E", "C"), m("A", "D"), m("B", "F")] },
    { time: "9:22 - 9:50", courts: [m("B", "C"), m("A", "E"), m("D", "F")] },
  ],
  clock: "Set clock at 26 minutes +4 minutes",
  scoring: "First games start at 4 points",
  setup: "A and B and E setup courts",
  totalPoints: 60,
};

/**
 * 5 teams, 2 courts, one sitting each slot.
 *
 * ADJUSTMENT ONLY. Every normal week is 4 or 6 — three courts hold six teams,
 * two courts hold four, and nobody sits. A five-team gym exists because another
 * gym fell through and its teams were spread across the rest, which is exactly
 * what produced the 13 April sheet this is transcribed from.
 *
 * Its scoring line is inferred, not observed: that sheet printed a clock but no
 * scoring note, so this borrows the 6-team one on the grounds that both play two
 * games per match. Worth confirming before a night runs on it. The setup duty is
 * left empty for the same reason — the source showed none, and inventing who
 * puts the nets up is not the sort of guess a gym should discover at 7:20.
 */
const POD_5: PodTemplate = {
  teams: 5,
  kind: "adjustment",
  title: "5-Team Schedule: 2-games per match",
  courtLabels: ["Court 1", "Court 2"],
  slots: [
    { time: "7:20 - 7:50", courts: [m("A", "C"), m("B", "D")], sitting: "E" },
    { time: "7:52 - 8:20", courts: [m("A", "D"), m("C", "E")], sitting: "B" },
    { time: "8:22 - 8:50", courts: [m("B", "C"), m("A", "E")], sitting: "D" },
    { time: "8:52 - 9:20", courts: [m("B", "E"), m("C", "D")], sitting: "A" },
    { time: "9:22 - 9:50", courts: [m("A", "B"), m("D", "E")], sitting: "C" },
  ],
  clock: "Set clock at 26 minutes +4 minutes",
  scoring: "First games start at 4 points",
  setup: "",
  totalPoints: 40,
};

/**
 * 7 teams, 3 courts, one sitting each slot. ADJUSTMENT ONLY — see POD_5.
 *
 * Seven slots rather than five, on a 17-minute clock, because twenty-one
 * fixtures do not fit a normal night any other way.
 */
const POD_7: PodTemplate = {
  teams: 7,
  kind: "adjustment",
  title: "7-Team Schedule: 2-games per match",
  courtLabels: ["Court 1", "Court 2", "Court 3"],
  slots: [
    {
      time: "7:20 - 7:40",
      courts: [m("C", "E"), m("D", "F"), m("B", "G")],
      sitting: "A",
    },
    {
      time: "7:41 - 8:01",
      courts: [m("D", "E"), m("A", "G"), m("C", "F")],
      sitting: "B",
    },
    {
      time: "8:02 - 8:22",
      courts: [m("D", "G"), m("A", "F"), m("B", "E")],
      sitting: "C",
    },
    {
      time: "8:23 - 8:43",
      courts: [m("B", "F"), m("C", "G"), m("A", "E")],
      sitting: "D",
    },
    {
      time: "8:44 - 9:04",
      courts: [m("F", "G"), m("B", "C"), m("A", "D")],
      sitting: "E",
    },
    {
      time: "9:05 - 9:25",
      courts: [m("A", "C"), m("E", "G"), m("B", "D")],
      sitting: "F",
    },
    {
      time: "9:26 - 9:46",
      courts: [m("A", "B"), m("C", "D"), m("E", "F")],
      sitting: "G",
    },
  ],
  clock: "Set clock at 17 minutes + 4 minutes",
  scoring: "First games start at 4 points",
  setup: "",
  totalPoints: 84,
};

const TEMPLATES = new Map<number, PodTemplate>([
  [4, POD_4],
  [5, POD_5],
  [6, POD_6],
  [7, POD_7],
]);

/** The grid for a pod of this size, or null where none is pinned yet. */
export function podTemplate(teamCount: number): PodTemplate | null {
  return TEMPLATES.get(teamCount) ?? null;
}

export function podSizesAvailable(): number[] {
  return [...TEMPLATES.keys()].sort((a, b) => a - b);
}

/** The sizes a normal week uses: 2 courts hold 4 teams, 3 courts hold 6. */
export function regularSizes(): number[] {
  return [...TEMPLATES.values()]
    .filter((t) => t.kind === "regular")
    .map((t) => t.teams)
    .sort((a, b) => a - b);
}

/** How many teams a gym with this many courts takes on a normal week. */
export function teamsForCourts(courts: number): number | null {
  if (courts === 2) return 4;
  if (courts === 3) return 6;
  return null;
}

/** Letters A, B, C… for a pod of `n`, in order. */
export function podLetters(n: number): PodLetter[] {
  return "ABCDEFG".slice(0, n).split("") as PodLetter[];
}

/**
 * Every fixture a letter plays, in slot order — the answer to "when am I on?".
 */
export function fixturesFor(
  template: PodTemplate,
  letter: PodLetter,
): { time: string; court: string; opponent: PodLetter }[] {
  const out: { time: string; court: string; opponent: PodLetter }[] = [];
  for (const slot of template.slots) {
    slot.courts.forEach((pairing, court) => {
      if (!pairing) return;
      if (pairing.home === letter) {
        out.push({
          time: slot.time,
          court: template.courtLabels[court],
          opponent: pairing.away,
        });
      } else if (pairing.away === letter) {
        out.push({
          time: slot.time,
          court: template.courtLabels[court],
          opponent: pairing.home,
        });
      }
    });
  }
  return out;
}

/**
 * Bind letters to real team names, seeded order first.
 *
 * A is the top seed coming into the night, which is what makes the duty lines
 * on the sheet meaningful — "Team D responsibilities" has to land on a
 * predictable team, not whoever happens to be listed fourth.
 */
export function assignLetters<T>(
  seeded: T[],
): { letter: PodLetter; team: T }[] {
  return seeded.map((team, i) => ({
    letter: podLetters(seeded.length)[i],
    team,
  }));
}

/**
 * The promotion line printed on a sheet: "2 up, 2 down".
 *
 * This belongs to where a tier SITS, not to how big it is. Bethune's sheet says
 * "2 down" because it is the top gym, and King is the same six-team grid but
 * moves teams up only — reading it off the pod size, as a first version of this
 * module did, would print "2 down" on the bottom of the ladder.
 *
 * `swaps[i]` is the exchange between tier `i` and tier `i + 1`, so a tier's
 * promotions come from the boundary above it and its relegations from the
 * boundary below.
 */
export function movementLabel(tierIndex: number, swaps: number[]): string {
  const up = tierIndex > 0 ? (swaps[tierIndex - 1] ?? 0) : 0;
  const down = swaps[tierIndex] ?? 0;
  const parts: string[] = [];
  if (up > 0) parts.push(`${up} up`);
  if (down > 0) parts.push(`${down} down`);
  // The top tier only drops and the bottom only climbs; a one-tier ladder
  // does neither, and saying nothing is better than saying "0 up, 0 down".
  return parts.join(", ");
}
