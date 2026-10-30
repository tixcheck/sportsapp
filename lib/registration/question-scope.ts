/**
 * Which question kinds a scope may use (0191).
 *
 * A TEAM question's answer is readable by everyone on the roster (0104), so it
 * must not ask for anyone's email, phone or home address: ask those per
 * player, where only the player and the organizer see the answer. The
 * database refuses it too (`registration_questions_team_no_contact`).
 *
 * Pure: no DB, no React.
 */
import type {
  QuestionKind,
  QuestionScope,
} from "@/lib/queries/registration-questions";

export const CONTACT_KINDS: readonly QuestionKind[] = [
  "email",
  "phone",
  "address",
];

export function kindAllowedForScope(
  scope: QuestionScope,
  kind: QuestionKind,
): boolean {
  return scope !== "team" || !CONTACT_KINDS.includes(kind);
}

export const TEAM_CONTACT_MESSAGE =
  "The whole team can see a team question's answer, so ask for an email, phone or address as a player question.";
