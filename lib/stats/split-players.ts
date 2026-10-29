/**
 * Players whose stats are split in two: some games under their account, some
 * under a typed name. Pure: no DB access.
 *
 * `linkSubsToAccounts` stops this at save time, but only for lineups saved
 * after it shipped (2026-10-21) and only for an exact name. Big Shoots,
 * 2026-10-29: Sean Gade still showed as 15-3 and 7-10, from lineups saved
 * before then. This finds what the save-time rule missed, and the near misses
 * it can never catch ("Tom Waite" typed for a "Tomas Waite" account).
 */
import { normalizeName } from "./attribution";
import type { KnownAccount } from "./link-subs";

export interface SplitPlayer {
  name: string;
  userId: string;
  /** `exact`: the save-time rule would link it. `near`: a person must decide. */
  kind: "exact" | "near";
}

const tokens = (n: string) => normalizeName(n).split(" ").filter(Boolean);

/** Same surname and first initial: "Tom Waite" and "Tomas Waite". */
function nearlySame(a: string, b: string): boolean {
  const x = tokens(a),
    y = tokens(b);
  if (x.length < 2 || y.length < 2) return false;
  if (x[x.length - 1] !== y[y.length - 1]) return false;
  return x[0][0] === y[0][0];
}

/**
 * For each typed name, the one account it belongs to. Names matching several
 * accounts are left out: guessing would merge two different people, and Big
 * Shoots has two real "Sean Gade" accounts.
 */
export function findSplitPlayers(
  typedNames: string[],
  known: KnownAccount[],
): SplitPlayer[] {
  const out: SplitPlayer[] = [];
  for (const name of new Set(typedNames)) {
    const key = normalizeName(name);
    const exact = new Set(
      known
        .filter((k) => k.names.some((n) => normalizeName(n) === key))
        .map((k) => k.userId),
    );
    if (exact.size === 1) {
      out.push({ name, userId: [...exact][0], kind: "exact" });
      continue;
    }
    if (exact.size > 1) continue;
    const near = new Set(
      known
        .filter((k) => k.names.some((n) => nearlySame(n, name)))
        .map((k) => k.userId),
    );
    if (near.size === 1) out.push({ name, userId: [...near][0], kind: "near" });
  }
  return out;
}
