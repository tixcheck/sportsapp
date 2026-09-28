/**
 * A ladder night on PINNED grids — Scarborough's, from `pod-templates.ts`.
 *
 * Nothing here is computed in the scheduling sense. Each tier's roster, in the
 * order it sits that week, is bound to the letters A, B, C… and the grid for
 * that many teams is read off as fixtures. The grid IS the schedule; the only
 * work is turning printed slot times and court headings into rows.
 *
 * Pure: no DB, no clock. The caller supplies the night's date.
 */
import { podLetters, podTemplate, type PodLetter } from "./pod-templates";

export interface PodTierRoster {
  divisionId: string;
  venueId: string | null;
  /** Seated order for the week: index 0 is A, the top seed coming in. */
  teamIds: string[];
}

export interface PodFixture {
  divisionId: string;
  venueId: string | null;
  homeTeamId: string;
  awayTeamId: string;
  /** Bare label, "1" not "Court 1" — how `court_list` stores courts. */
  court: string;
  /** 0-based slot in the grid; the printed range comes from the template. */
  slotIndex: number;
  /** Local wall-clock start, 24-hour. */
  hour: number;
  minute: number;
}

export interface PodNightPlan {
  fixtures: PodFixture[];
  /** Tiers that could not be drawn, and why. A missing grid is never guessed. */
  problems: { divisionId: string; reason: string }[];
}

/**
 * "7:20 - 7:41" → 19:20. Every slot on their sheets is an evening time and the
 * sheets never print AM/PM, so anything before noon is read as PM.
 */
export function slotStart(time: string): { hour: number; minute: number } {
  const [h, m] = time.split("-")[0].trim().split(":").map(Number);
  return { hour: h < 12 ? h + 12 : h, minute: m };
}

/** "Court 3" → "3", matching how `court_list` stores labels. */
export function bareCourt(label: string): string {
  return label.replace(/^court\s+/i, "");
}

export function planPodNight(tiers: PodTierRoster[]): PodNightPlan {
  const fixtures: PodFixture[] = [];
  const problems: PodNightPlan["problems"] = [];

  for (const tier of tiers) {
    const template = podTemplate(tier.teamIds.length);
    if (!template) {
      problems.push({
        divisionId: tier.divisionId,
        reason: `no pinned grid for ${tier.teamIds.length} teams`,
      });
      continue;
    }

    const byLetter = new Map<PodLetter, string>(
      podLetters(tier.teamIds.length).map((l, i) => [l, tier.teamIds[i]]),
    );

    template.slots.forEach((slot, slotIndex) => {
      const { hour, minute } = slotStart(slot.time);
      slot.courts.forEach((pairing, courtIndex) => {
        if (!pairing) return;
        fixtures.push({
          divisionId: tier.divisionId,
          venueId: tier.venueId,
          homeTeamId: byLetter.get(pairing.home)!,
          awayTeamId: byLetter.get(pairing.away)!,
          court: bareCourt(template.courtLabels[courtIndex]),
          slotIndex,
          hour,
          minute,
        });
      });
    });
  }

  return { fixtures, problems };
}

const DAY_MS = 86_400_000;

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * The first playing night on or after `startIso` that falls on weekday `dow`
 * (0 = Sunday) and is not blacked out.
 */
export function firstPlayingNight(
  startIso: string,
  dow: number,
  blackouts: readonly string[],
): string {
  let date = startIso;
  for (let i = 0; i < 7; i++) {
    const [y, m, d] = date.split("-").map(Number);
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === dow) break;
    date = addDays(date, 1);
  }
  return skipBlackouts(date, blackouts);
}

/**
 * The next playing night after `previousIso`: a week on, skipping blackouts.
 *
 * Counted from the night the previous week ACTUALLY ran rather than from the
 * season's start date. Scarborough's start date is their draft night, which is
 * not a week — counting from it would put week 1 a week early, and a date
 * off by a week on a printed gym sheet is not the kind of error anyone catches
 * until they are standing in an empty gym.
 */
export function nextPlayingNight(
  previousIso: string,
  blackouts: readonly string[],
): string {
  return skipBlackouts(addDays(previousIso, 7), blackouts);
}

function skipBlackouts(iso: string, blackouts: readonly string[]): string {
  const off = new Set(blackouts);
  let date = iso;
  // A season is never blacked out for a year; the bound only stops a bad
  // blackout list from spinning forever.
  for (let i = 0; i < 52 && off.has(date); i++) date = addDays(date, 7);
  return date;
}
