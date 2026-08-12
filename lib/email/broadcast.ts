/**
 * Working out who gets an organizer's broadcast, and in what batches.
 *
 * Pure. The action fetches rows and hands them here; this decides who is
 * eligible, dedupes them, and slices the list into Resend-sized chunks. Keeping
 * it out of the action is what lets "does an opted-out captain still get it?"
 * be a test rather than a discussion.
 */

/** Resend accepts at most this many messages per batch call. */
export const BATCH_SIZE = 100;

/**
 * A hard ceiling per broadcast. Not a technical limit — a guard against an
 * organizer selecting every event they have ever run and mailing thousands of
 * people with one click. Over this, the UI asks them to narrow the selection.
 */
export const MAX_RECIPIENTS = 2000;

export type BroadcastMember = {
  userId: string;
  email: string | null;
  /** The per-user opt-out for organizer announcements. */
  notifyOrgMessages: boolean;
  unsubscribeToken: string | null;
  role: "captain" | "player";
};

export type BroadcastRecipient = {
  userId: string;
  email: string;
  unsubscribeToken: string;
};

export type Audience = "players" | "captains";

/**
 * Everyone who should receive this message, exactly once.
 *
 * Dropped, and why:
 * - opted out — the whole point of the preference;
 * - no email, or no unsubscribe token — we cannot mail them, and we must never
 *   send a broadcast without a working opt-out link;
 * - not a captain, when the audience is captains only.
 *
 * Deduped by user: someone captaining two teams in the same league is one
 * person, and receiving the same announcement twice reads as a bug.
 */
export function resolveRecipients(
  members: BroadcastMember[],
  audience: Audience,
): BroadcastRecipient[] {
  const seen = new Set<string>();
  const out: BroadcastRecipient[] = [];

  for (const m of members) {
    if (audience === "captains" && m.role !== "captain") continue;
    if (!m.notifyOrgMessages) continue;

    const email = m.email?.trim();
    if (!email || !m.unsubscribeToken) continue;
    if (seen.has(m.userId)) continue;

    seen.add(m.userId);
    out.push({
      userId: m.userId,
      email,
      unsubscribeToken: m.unsubscribeToken,
    });
  }

  return out;
}

/** Slice into batches Resend will accept in one call. */
export function chunkRecipients<T>(
  recipients: T[],
  size: number = BATCH_SIZE,
): T[][] {
  if (size < 1) throw new Error("batch size must be at least 1");
  const out: T[][] = [];
  for (let i = 0; i < recipients.length; i += size) {
    out.push(recipients.slice(i, i + size));
  }
  return out;
}

/**
 * Turn an organizer's plain-text message into paragraphs.
 *
 * Plain text in, paragraphs out — deliberately not rich text or HTML. v0
 * doesn't allow user HTML anywhere (CLAUDE.md), and an email body is the last
 * place to start: anything a user types here would be rendered in someone
 * else's mail client, which is about the worst possible place for an injection.
 */
export function toParagraphs(body: string): string[] {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}
