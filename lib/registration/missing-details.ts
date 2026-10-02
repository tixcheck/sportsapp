import type {
  AnswerMap,
  RegistrationQuestion,
} from "@/lib/queries/registration-questions";
import { missingRequired } from "@/lib/registration/required-answers";

/**
 * Players who owe the organizer required details, and can be asked for them.
 *
 * BVL, 2026-10-02: forming individual teams with "no clue who's a dude or a
 * girl" — the questions were optional when people signed up and required now,
 * and nothing ever went back to ask. A player can be asked when they have an
 * account (their answers are theirs to give, on their dashboard) and are in
 * the league — on a roster, or in the pool waiting to be placed.
 *
 * Pure: the directory rows and questions come in, the people to ask go out.
 */
export interface DetailsRow {
  userId: string | null;
  name: string;
  email: string | null;
  hasRosterRow: boolean;
  freeAgentStatus: string | null;
  answers: AnswerMap;
}

export interface MissingDetails {
  userId: string;
  name: string;
  email: string;
  missing: string[];
}

export function playersMissingDetails(
  rows: DetailsRow[],
  questions: RegistrationQuestion[],
): MissingDetails[] {
  const out: MissingDetails[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.userId || !r.email || seen.has(r.userId)) continue;
    const inLeague =
      r.hasRosterRow ||
      r.freeAgentStatus === "available" ||
      r.freeAgentStatus === "pending_payment" ||
      r.freeAgentStatus === "placed";
    if (!inLeague) continue;
    const missing = missingRequired(questions, r.answers);
    if (missing.length === 0) continue;
    seen.add(r.userId);
    out.push({
      userId: r.userId,
      name: r.name,
      email: r.email,
      missing: missing.map((q) => q.label),
    });
  }
  return out;
}
