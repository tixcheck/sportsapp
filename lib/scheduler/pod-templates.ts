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

export interface PodTemplate {
  teams: number;
  /** Court headings as printed, e.g. ["Court 1", "Court 2", "Court 3"]. */
  courtLabels: string[];
  slots: PodSlot[];
  /** "6-Team Schedule: 2-games per match" */
  title: string;
  /** "Set clock at 26 minutes +4 minutes" */
  clock: string;
  /** "First games start at 4 points" */
  scoring: string;
  /** "2 down" / "2 up, 2 down" — the promotion rule printed on the sheet. */
  movement: string;
  /** "A and B and E setup courts" */
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
  title: "4-Team Schedule: 3-games per match",
  courtLabels: ["Court 1", "Court 2"],
  slots: [
    { time: "7:20 - 8:10", courts: [m("A", "C"), m("B", "D")] },
    { time: "8:12 - 9:00", courts: [m("A", "D"), m("B", "C")] },
    { time: "9:02 - 9:50", courts: [m("A", "B"), m("C", "D")] },
  ],
  clock: "Set clock at 45 minutes +4 minutes",
  scoring: "Games 1&2 start at 4 points, Game 3 at 0",
  movement: "2 up, 2 down",
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
  movement: "2 down",
  setup: "A and B and E setup courts",
  totalPoints: 60,
};

const TEMPLATES = new Map<number, PodTemplate>([
  [4, POD_4],
  [6, POD_6],
]);

/** The grid for a pod of this size, or null where none is pinned yet. */
export function podTemplate(teamCount: number): PodTemplate | null {
  return TEMPLATES.get(teamCount) ?? null;
}

export function podSizesAvailable(): number[] {
  return [...TEMPLATES.keys()].sort((a, b) => a - b);
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
