/**
 * Why a team is not in the schedule yet — the sentence, not the status.
 *
 * `teams.status` says `pending_waiver` for BOTH reasons a competition holds a
 * team back, because that is all the scheduler needs to know. A captain needs
 * more: "waiting on the waiver" and "waiting on a sixth player" are different
 * problems with different people to chase, and telling someone the wrong one
 * sends them off to chase nobody.
 *
 * This MIRRORS `public.team_entry_blocked` (migration 0101) and must keep
 * mirroring it, including the ORDER of the two checks — roster first, then
 * signatures. If the two ever disagree, the page explains one reason while the
 * database enforces another, which is worse than explaining nothing.
 *
 * Pure: given the facts, it returns the reason.
 */

export type GatePlayer = { userId: string; name: string };

export type TeamEntryGate =
  | {
      reason: "roster";
      rosterSize: number;
      minRoster: number;
      /** How many more players are needed. Always ≥ 1. */
      shortBy: number;
    }
  | {
      reason: "waiver";
      /** Rostered players who haven't signed, named. */
      outstanding: GatePlayer[];
    };

export type TeamEntryFacts = {
  /** `teams.status`. */
  status: string;
  /** `competitions.min_roster_for_entry`. Null = no requirement. */
  minRoster: number | null;
  /** Whether the competition requires a waiver at all. */
  waiverRequired: boolean;
  roster: { userId: string; name: string; signed: boolean }[];
};

/**
 * The gate holding this team, or null when nothing is.
 *
 * Null covers every "show the schedule" case on purpose — not held, no waiver
 * required, everyone signed, roster full — because every caller does the same
 * thing with all of them.
 */
export function teamEntryGate(f: TeamEntryFacts): TeamEntryGate | null {
  // Money is a separate gate with its own card; a team held for payment must
  // not be told it is waiting on signatures.
  if (f.status !== "pending_waiver") return null;

  // Roster first, exactly as the database checks it. A team that is both short
  // AND unsigned is short — there is no point chasing a signature from someone
  // who cannot enter yet anyway.
  if (f.minRoster !== null && f.roster.length < f.minRoster) {
    return {
      reason: "roster",
      rosterSize: f.roster.length,
      minRoster: f.minRoster,
      shortBy: f.minRoster - f.roster.length,
    };
  }

  if (!f.waiverRequired) return null;

  const outstanding = f.roster
    .filter((p) => !p.signed)
    .map(({ userId, name }) => ({ userId, name }));

  // An empty roster owes no signatures — `exists(...)` over nothing is false,
  // and the database agrees. Without a minimum there is nothing to report.
  return outstanding.length > 0 ? { reason: "waiver", outstanding } : null;
}
