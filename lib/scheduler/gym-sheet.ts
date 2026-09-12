import {
  podTemplate,
  podLetters,
  type PodLetter,
  type PodTemplate,
} from "./pod-templates";

/**
 * A night's gym sheet: the grid with real team names on it.
 *
 * Their paper sheet works in letters — "A vs C", with a legend mapping A to
 * VOID — because you cannot rewrite six team names into a printed grid every
 * week by hand. The letters are an artefact of the medium, not of the format.
 * An app has no such constraint, so it prints the names and the legend stops
 * being necessary at all.
 *
 * The letters survive INSIDE the template, as the stable shape of the grid.
 * They are bound to teams here, in seeded order, and never shown.
 *
 * Pure: no DB, no clock.
 */

export interface SheetTeam {
  id: string;
  name: string;
}

export interface SheetFixture {
  court: string;
  home: SheetTeam;
  away: SheetTeam;
}

export interface SheetSlot {
  time: string;
  fixtures: SheetFixture[];
  /** The team sitting this slot out, where the pod has one. */
  sitting?: SheetTeam;
}

export interface GymSheet {
  /** "6-Team Schedule: 2-games per match" */
  title: string;
  courtLabels: string[];
  slots: SheetSlot[];
  clock: string;
  scoring: string;
  /** "2 up, 2 down" — supplied, since it depends on the tier's position. */
  movement: string;
  /** "VOID and ONE PUNCH set up courts" — letters resolved to names. */
  setup: string;
  totalPoints: number;
  /** Every team on the sheet, in seeded order — the score grid's rows. */
  teams: SheetTeam[];
}

/**
 * Build the sheet for one tier on one night.
 *
 * `teams` must be in seeded order: the template's A is the first, B the
 * second, and so on. That ordering is what makes the duty lines land on a
 * predictable team rather than whoever happens to be listed fourth.
 *
 * Returns null when no grid is pinned for that many teams — better a missing
 * sheet than an invented schedule, since the gym runs off this.
 */
export function buildGymSheet(
  teams: SheetTeam[],
  movement: string,
): GymSheet | null {
  const template = podTemplate(teams.length);
  if (!template) return null;

  const byLetter = new Map<PodLetter, SheetTeam>();
  podLetters(teams.length).forEach((letter, i) => {
    byLetter.set(letter, teams[i]);
  });
  const team = (l: PodLetter) => byLetter.get(l)!;

  const slots: SheetSlot[] = template.slots.map((slot) => ({
    time: slot.time,
    fixtures: slot.courts
      .map((pairing, court) =>
        pairing
          ? {
              court: template.courtLabels[court],
              home: team(pairing.home),
              away: team(pairing.away),
            }
          : null,
      )
      .filter((f): f is SheetFixture => f !== null),
    ...(slot.sitting ? { sitting: team(slot.sitting) } : {}),
  }));

  return {
    title: template.title,
    courtLabels: template.courtLabels,
    slots,
    clock: template.clock,
    scoring: template.scoring,
    movement,
    setup: resolveDuty(template.setup, byLetter),
    totalPoints: template.totalPoints,
    teams,
  };
}

/**
 * Replace bare letters in a TEMPLATE duty line with team names.
 *
 * "A and B and E setup courts" becomes "VOID and ONE PUNCH and BEERS setup
 * courts". Word-bounded, so a letter inside a word is untouched.
 *
 * Only safe on text WE author — the pod templates. In English prose a
 * standalone "A" is usually the article, and the first sample sheet printed
 * "VOID 4-minute warning will be given" from an organizer's "A 4-minute
 * warning…". Organizer text uses {A} instead; see `resolvePlaceholders`.
 */
export function resolveDuty(
  text: string,
  byLetter: Map<PodLetter, SheetTeam>,
): string {
  return text.replace(/\b([A-G])\b/g, (match, letter: PodLetter) => {
    const t = byLetter.get(letter);
    return t ? t.name : match;
  });
}

/** The same, from a plain team list — for duty text held outside a template. */
export function resolveDutyForTeams(text: string, teams: SheetTeam[]): string {
  const byLetter = new Map<PodLetter, SheetTeam>();
  podLetters(teams.length).forEach((letter, i) =>
    byLetter.set(letter, teams[i]),
  );
  return resolveDuty(text, byLetter);
}

/** Which sizes can currently be printed. */
export function printableSizes(): number[] {
  return [4, 6];
}

void (undefined as unknown as PodTemplate);

/**
 * Replace {A}…{G} placeholders with team names, in organizer-authored text.
 *
 * Explicit braces rather than bare letters because instructions are prose, and
 * prose contains the word "A". An organizer who wants the fourth seed named
 * writes "Team {D} responsibilities"; everything else is left exactly as typed,
 * including any stray capital letter.
 *
 * A placeholder with no team behind it — {G} in a four-team gym — is left
 * visible rather than silently blanked, so it reads as the mistake it is.
 */
export function resolvePlaceholders(text: string, teams: SheetTeam[]): string {
  const byLetter = new Map<PodLetter, SheetTeam>();
  podLetters(teams.length).forEach((letter, i) =>
    byLetter.set(letter, teams[i]),
  );
  return text.replace(/\{([A-G])\}/g, (match, letter: PodLetter) => {
    const t = byLetter.get(letter);
    return t ? t.name : match;
  });
}
