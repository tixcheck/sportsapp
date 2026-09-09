/**
 * What a captain is told after registering: the night, and what they still owe.
 *
 * Pure so it can be tested without a database or a mail server — the wording
 * here is the part that is easy to get quietly wrong, and "you're all set" sent
 * to a team that has not paid is the specific mistake worth a test.
 */

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** "18:00" → "6:00 PM". Returns null for anything unparseable. */
export function formatClock(hhmm: string | null | undefined): string | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2];
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  const suffix = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${min} ${suffix}`;
}

/**
 * "Tuesdays · 6:00 PM". Either half may be missing — an organizer can open
 * registration before settling the night, and half an answer beats none.
 */
export function formatWhen(
  dayOfWeek: number | null | undefined,
  startTime: string | null | undefined,
): string | null {
  const day =
    dayOfWeek !== null && dayOfWeek !== undefined && DAYS[dayOfWeek]
      ? `${DAYS[dayOfWeek]}s`
      : null;
  const time = formatClock(startTime);
  return [day, time].filter(Boolean).join(" · ") || null;
}

export interface OutstandingInput {
  /** The team was admitted only provisionally, pending payment. */
  pendingPayment: boolean;
  /** How the captain said they would pay. */
  paymentMode: "team_full" | "player_share" | null;
  /** The organizer takes payment outside the app (e-transfer, PayPal, cash). */
  offlinePayment: boolean;
  /** This competition requires a signed waiver from its entrants. */
  waiverRequired: boolean;
  /** Rostered players still needed before the team counts as entered. */
  playersStillNeeded: number;
}

/**
 * The checklist, in the order a captain can act on it.
 *
 * Payment first because it is the one that blocks entry outright, then the
 * waiver, then the roster — a captain can chase teammates while the rest
 * settles, so it goes last rather than at the top where it reads as a blocker.
 */
export function outstandingItems(input: OutstandingInput): string[] {
  const items: string[] = [];

  if (input.pendingPayment) {
    if (input.paymentMode === "player_share") {
      items.push(
        input.offlinePayment
          ? "Each player pays their share to the organizer"
          : "Each player pays their share — send them the payment link",
      );
    } else {
      items.push(
        input.offlinePayment
          ? "Pay the entry fee to the organizer"
          : "Pay the entry fee",
      );
    }
  }

  if (input.waiverRequired) {
    items.push("Every player on the roster signs the waiver");
  }

  if (input.playersStillNeeded > 0) {
    items.push(
      input.playersStillNeeded === 1
        ? "Add 1 more player to the roster"
        : `Add ${input.playersStillNeeded} more players to the roster`,
    );
  }

  return items;
}
