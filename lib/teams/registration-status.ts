/**
 * What stage of registration a team is actually at.
 *
 * The database stores four statuses — active, pending_payment, pending_waiver,
 * withdrawn — because four is all the SCHEDULER needs to know. An organizer
 * needs more than that: "pending" answers none of the questions they are
 * actually asking, which are whether the money has arrived, whether they have
 * to go and check it, and who is holding the team up.
 *
 * So this derives a richer picture from what is already recorded, rather than
 * adding statuses the scheduler would then have to learn. Pure: given the
 * facts, it returns the sentence.
 */

export type RegistrationStage =
  | "withdrawn"
  | "awaiting_payment"
  | "verifying_payment"
  | "roster_short"
  | "awaiting_waivers"
  | "registered";

export type RegistrationStatus = {
  stage: RegistrationStage;
  /** Short, for a badge. */
  label: string;
  /** One line saying what happens next, and whose move it is. */
  detail: string;
  /**
   * `action` means the ORGANIZER has something to do — money to check. `wait`
   * means the team does. Separated because an organizer scanning a list wants
   * to find their own work, not be alarmed by everyone else's.
   */
  tone: "action" | "wait" | "done" | "off";
};

export type TeamFacts = {
  status: string;
  /** Cents recorded as paid across every payment on this team. */
  paidCents: number;
  /** What the organizer set as the fee. 0 when the event is free. */
  feeCents: number;
  /** An offline payment the team says they've made, not yet confirmed. */
  hasUnconfirmedPayment: boolean;
  /** Players on the roster, and the minimum this competition requires. */
  rosterSize: number;
  minRoster: number | null;
  /** Rostered players who have signed, when a waiver is required. */
  signed: number;
  waiverRequired: boolean;
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function teamRegistrationStatus(f: TeamFacts): RegistrationStatus {
  if (f.status === "withdrawn") {
    return {
      stage: "withdrawn",
      label: "Withdrawn",
      detail: "Not playing. Their spot is free for another team.",
      tone: "off",
    };
  }

  // Money first, because it is the only stage where the ORGANIZER is the one
  // holding things up, and a list is scanned for one's own work.
  if (f.status === "pending_payment") {
    if (f.hasUnconfirmedPayment) {
      return {
        stage: "verifying_payment",
        label: "Payment to verify",
        detail:
          "They say they've paid. Check it against your account and confirm it below.",
        tone: "action",
      };
    }
    return {
      stage: "awaiting_payment",
      label: "Awaiting payment",
      detail: "Registered, but the fee hasn't been started yet.",
      tone: "wait",
    };
  }

  if (f.status === "pending_waiver") {
    // Paid is worth saying explicitly. An organizer looking at a held team
    // wants to know the money is not the problem.
    const paid = f.feeCents > 0 && f.paidCents >= f.feeCents;
    const prefix = paid ? "Paid — " : "";

    if (f.minRoster !== null && f.rosterSize < f.minRoster) {
      return {
        stage: "roster_short",
        label: paid ? "Paid · roster short" : "Roster short",
        detail: `${prefix}${f.rosterSize} of ${f.minRoster} players so far. Teammates join by accepting their invite.`,
        tone: "wait",
      };
    }

    const owing = Math.max(0, f.rosterSize - f.signed);
    return {
      stage: "awaiting_waivers",
      label: paid ? "Paid · waivers" : "Waiting on waivers",
      detail: f.waiverRequired
        ? `${prefix}${plural(owing, "player", "players")} still to sign. The team joins the schedule when everyone has.`
        : `${prefix}Not confirmed yet.`,
      tone: "wait",
    };
  }

  return {
    stage: "registered",
    label: "Fully registered",
    detail:
      f.feeCents > 0
        ? "Paid, signed, and in the schedule."
        : "Signed and in the schedule.",
    tone: "done",
  };
}
