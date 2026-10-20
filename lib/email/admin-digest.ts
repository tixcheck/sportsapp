/**
 * The organizers' Sunday to-do email: what's waiting on an admin, per event.
 *
 * The owner asked for it (2026-10-20) after a by-hand check of BVL turned up
 * a PayPal payment nobody had confirmed for a week, a free agent who couldn't
 * be placed until theirs was, and teams held out of the standings. Nothing
 * there was hidden, but each lived on a different tab of a different league.
 *
 * Pure: the cron loads rows, this decides what's worth saying and words it.
 */

import { DateTime } from "luxon";

/** A game that was played (or should have been) and has no result. */
export type DigestGame = {
  summary: string;
  /** ISO, UTC. */
  scheduledAt: string;
};

export type DigestPayment = {
  payer: string;
  amountCents: number;
  method: string;
  /** ISO, when the payer said they'd paid. */
  since: string;
};

export type DigestHeldTeam = {
  name: string;
  /** pending_payment or pending_waiver, the team's status. */
  reason: "payment" | "waiver";
};

export type AdminDigestCompetition = {
  competitionId: string;
  name: string;
  timezone: string;
  /** Absolute link to the event's organizer page. */
  url: string;
  unscored: DigestGame[];
  /**
   * Ladder tiers whose night has no finishing order yet, in a ladder that
   * records the order rather than each game (0117). One per tier per night,
   * so 87 unplayed-looking games read as the 7 tiers they are.
   */
  unrankedTiers: DigestGame[];
  awaitingConfirmation: DigestGame[];
  disputed: DigestGame[];
  paymentsToConfirm: DigestPayment[];
  heldTeams: DigestHeldTeam[];
  freeAgentsToPlace: number;
  waitlisted: number;
};

export type AdminDigestSection = {
  competitionName: string;
  url: string;
  lines: { text: string; items?: string[] }[];
};

/** A game is listed by date and teams; the list is capped so the email stays short. */
export const MAX_LISTED = 5;

const METHOD: Record<string, string> = {
  etransfer: "e-transfer",
  paypal: "PayPal",
  cash: "cash",
  other: "other",
  card: "card",
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

function money(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-CA", {
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function day(iso: string, zone: string): string {
  return DateTime.fromISO(iso, { zone: "utc" })
    .setZone(zone)
    .toFormat("ccc, LLL d");
}

/** Oldest first, capped, with "and N more" so a long list still reads as a count. */
function listed<T>(
  rows: T[],
  word: (r: T) => string,
  order: (r: T) => string,
): string[] {
  const sorted = [...rows].sort((a, b) => order(a).localeCompare(order(b)));
  const shown = sorted.slice(0, MAX_LISTED).map(word);
  if (sorted.length > MAX_LISTED)
    shown.push(`and ${sorted.length - MAX_LISTED} more`);
  return shown;
}

/** One event's to-do lines, most urgent first. Null when there's nothing to do. */
export function digestSection(
  c: AdminDigestCompetition,
): AdminDigestSection | null {
  const lines: AdminDigestSection["lines"] = [];
  const game = (g: DigestGame) =>
    `${day(g.scheduledAt, c.timezone)} · ${g.summary}`;
  const byDate = (g: DigestGame) => g.scheduledAt;

  if (c.disputed.length) {
    lines.push({
      text: `${plural(c.disputed.length, "disputed score", "disputed scores")} to settle`,
      items: listed(c.disputed, game, byDate),
    });
  }
  if (c.unscored.length) {
    lines.push({
      text: `${plural(c.unscored.length, "game", "games")} with no score`,
      items: listed(c.unscored, game, byDate),
    });
  }
  if (c.unrankedTiers.length) {
    lines.push({
      text: `${plural(c.unrankedTiers.length, "ladder tier", "ladder tiers")} with no finishing order entered`,
      items: listed(c.unrankedTiers, game, byDate),
    });
  }
  if (c.paymentsToConfirm.length) {
    lines.push({
      text: `${plural(c.paymentsToConfirm.length, "payment", "payments")} to confirm you received`,
      items: listed(
        c.paymentsToConfirm,
        (p) =>
          `${p.payer} · ${money(p.amountCents)} ${METHOD[p.method] ?? p.method} · since ${day(p.since, c.timezone)}`,
        (p) => p.since,
      ),
    });
  }
  if (c.heldTeams.length) {
    lines.push({
      text: `${plural(c.heldTeams.length, "team", "teams")} not in the standings yet`,
      items: listed(
        c.heldTeams,
        (t) =>
          `${t.name} · ${t.reason === "payment" ? "fee not paid" : "players to join or sign the waiver"}`,
        (t) => t.name,
      ),
    });
  }
  if (c.awaitingConfirmation.length) {
    lines.push({
      text: `${plural(c.awaitingConfirmation.length, "score", "scores")} waiting for the other team to confirm`,
      items: listed(c.awaitingConfirmation, game, byDate),
    });
  }
  if (c.freeAgentsToPlace > 0) {
    lines.push({
      text: `${plural(c.freeAgentsToPlace, "free agent", "free agents")} to put on a team`,
    });
  }
  if (c.waitlisted > 0) {
    lines.push({
      text: `${plural(c.waitlisted, "team", "teams")} on the waitlist with no spot offered`,
    });
  }

  if (lines.length === 0) return null;
  return { competitionName: c.name, url: c.url, lines };
}

/** Every event's section, in name order, empty ones dropped. */
export function buildAdminDigest(
  comps: AdminDigestCompetition[],
): AdminDigestSection[] {
  return [...comps]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(digestSection)
    .filter((s): s is AdminDigestSection => s !== null);
}

/** How long after the start time a game with no score is listed. */
export const UNSCORED_AFTER_HOURS = 3;
/** Games older than this are a cleanup job, not a weekly to-do. */
export const UNSCORED_LOOKBACK_DAYS = 28;

/** Whether a game belongs on the "no score" list. */
export function isUnscored(
  m: {
    status: string;
    scheduledAt: string | null;
    hasTeams: boolean;
    hasSets: boolean;
  },
  now: DateTime,
): boolean {
  if (m.status !== "scheduled" && m.status !== "in_progress") return false;
  if (!m.scheduledAt || !m.hasTeams || m.hasSets) return false;
  const at = DateTime.fromISO(m.scheduledAt, { zone: "utc" });
  if (!at.isValid) return false;
  const hours = now.diff(at, "hours").hours;
  return hours >= UNSCORED_AFTER_HOURS && hours <= UNSCORED_LOOKBACK_DAYS * 24;
}
