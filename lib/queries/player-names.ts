import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  isFirstNameLabel,
  isLastNameLabel,
  type PlayerNameParts,
} from "@/lib/registration/player-name";

export type NameAnswers = Map<string, { first: string; last: string }>;

/**
 * The First/Last name answers for one competition, by user.
 *
 * Empty when the competition asks for neither, which is the common case and
 * the reason every caller must treat a miss as "use the account name" rather
 * than as an error. See `lib/registration/player-name.ts` for why the two
 * questions are found by label.
 *
 * Organizer surfaces only. RLS on `registration_answers` returns a player
 * their own rows and an admin everything, so a member calling this gets their
 * own name and nobody else's — which is correct, and also why this must never
 * back a list that a teammate can see.
 */
export async function getPlayerNameAnswers(
  competitionId: string,
): Promise<NameAnswers> {
  const supabase = await createClient();

  const { data: questions } = await supabase
    .from("registration_questions")
    .select("id, label")
    .eq("competition_id", competitionId)
    .eq("scope", "player")
    .eq("kind", "short_text");

  const firstIds = new Set<string>();
  const lastIds = new Set<string>();
  for (const q of (questions ?? []) as { id: string; label: string }[]) {
    if (isFirstNameLabel(q.label)) firstIds.add(q.id);
    else if (isLastNameLabel(q.label)) lastIds.add(q.id);
  }
  const ids = [...firstIds, ...lastIds];
  if (ids.length === 0) return new Map();

  const { data: answers } = await supabase
    .from("registration_answers")
    .select("question_id, user_id, value")
    .eq("competition_id", competitionId)
    .in("question_id", ids);

  const out: NameAnswers = new Map();
  for (const a of (answers ?? []) as {
    question_id: string;
    user_id: string | null;
    value: string | null;
  }[]) {
    if (!a.user_id) continue;
    const value = (a.value ?? "").trim();
    if (!value) continue;
    const entry = out.get(a.user_id) ?? { first: "", last: "" };
    // First answer wins if a competition somehow asks twice — a second
    // "First name" question is extra detail, not a second person.
    if (firstIds.has(a.question_id)) entry.first ||= value;
    else entry.last ||= value;
    out.set(a.user_id, entry);
  }
  return out;
}

/** Fold the answers for one user into the parts `resolvePlayerName` takes. */
export function namePartsFor(
  names: NameAnswers,
  userId: string | null,
  displayName: string | null,
  email: string | null,
): PlayerNameParts {
  const answered = userId ? names.get(userId) : undefined;
  return {
    first: answered?.first ?? null,
    last: answered?.last ?? null,
    displayName,
    email,
  };
}
