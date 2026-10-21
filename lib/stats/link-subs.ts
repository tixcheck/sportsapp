/**
 * Typed-in subs, matched to the accounts they belong to. Pure: no DB access.
 *
 * "Add a sub" on the lineup screen is a name box, so a sub was always saved
 * with no account, even when they had one. Stats key a player by account if
 * there is one and by name if not, so anyone who was drafted one session and
 * subbed the next showed up as two players (Big Shoots, 2026-10-21: Sean Gade
 * and David Aitken, "there are two David Aitkens").
 */
import { normalizeName } from "./attribution";

/** Somebody in the league with an account, under every name they go by. */
export interface KnownAccount {
  userId: string;
  /** The name they signed up with, their account's display name, and so on. */
  names: string[];
}

/**
 * Give each accountless player the account whose name matches theirs. Only an
 * unambiguous match counts: a name two accounts share stays a typed name, and
 * so does a match to an account already in this lineup (that would list one
 * person twice).
 */
export function linkSubsToAccounts<
  P extends { userId: string | null; name: string },
>(players: P[], known: KnownAccount[]): P[] {
  const byName = new Map<string, Set<string>>();
  for (const k of known) {
    for (const n of k.names) {
      const key = normalizeName(n);
      if (!key) continue;
      const ids = byName.get(key) ?? new Set<string>();
      ids.add(k.userId);
      byName.set(key, ids);
    }
  }
  const taken = new Set(
    players.map((p) => p.userId).filter((id): id is string => id !== null),
  );
  return players.map((p) => {
    if (p.userId !== null) return p;
    const ids = byName.get(normalizeName(p.name));
    if (!ids || ids.size !== 1) return p;
    const [userId] = ids;
    if (taken.has(userId)) return p;
    taken.add(userId);
    return { ...p, userId };
  });
}
