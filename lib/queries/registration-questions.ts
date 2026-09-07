import "server-only";

import { createClient } from "@/lib/supabase/server";

export type QuestionKind =
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "select"
  | "yes_no";

export type QuestionScope = "team" | "player";

export type RegistrationQuestion = {
  id: string;
  scope: QuestionScope;
  kind: QuestionKind;
  label: string;
  helpText: string | null;
  options: string[];
  required: boolean;
  position: number;
  /** Set on a follow-up, with the parent answer that reveals it. */
  parentQuestionId: string | null;
  showWhen: string | null;
};

/** questionId → the answer given. */
export type AnswerMap = Record<string, string>;

function toQuestion(r: Record<string, unknown>): RegistrationQuestion {
  return {
    id: r.id as string,
    scope: r.scope as QuestionScope,
    kind: r.kind as QuestionKind,
    label: r.label as string,
    helpText: (r.help_text as string | null) ?? null,
    options: (r.options as string[] | null) ?? [],
    required: r.required as boolean,
    position: r.position as number,
    parentQuestionId: (r.parent_question_id as string | null) ?? null,
    showWhen: (r.show_when as string | null) ?? null,
  };
}

const COLUMNS =
  "id, scope, kind, label, help_text, options, required, position, parent_question_id, show_when";

/**
 * What this competition asks, in display order.
 *
 * Returns both scopes when none is named, because the organizer's editor
 * shows them side by side and asking twice would be two round trips for one
 * screen.
 */
export async function getRegistrationQuestions(
  competitionId: string,
  scope?: QuestionScope,
): Promise<RegistrationQuestion[]> {
  const supabase = await createClient();
  let query = supabase
    .from("registration_questions")
    .select(COLUMNS)
    .eq("competition_id", competitionId);
  if (scope) query = query.eq("scope", scope);

  const { data } = await query
    .order("scope", { ascending: true })
    .order("position", { ascending: true });

  return (data ?? []).map((r) => toQuestion(r as Record<string, unknown>));
}

/** The signed-in player's own answers for a competition. */
export async function getMyPlayerAnswers(
  competitionId: string,
): Promise<AnswerMap> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data } = await supabase
    .from("registration_answers")
    .select("question_id, value")
    .eq("competition_id", competitionId)
    .eq("user_id", user.id);

  return Object.fromEntries(
    (data ?? []).map((r) => [r.question_id as string, r.value as string]),
  );
}

/** One team's answers to the team-scope questions. */
export async function getTeamAnswers(teamId: string): Promise<AnswerMap> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("registration_answers")
    .select("question_id, value")
    .eq("team_id", teamId);

  return Object.fromEntries(
    (data ?? []).map((r) => [r.question_id as string, r.value as string]),
  );
}

/**
 * Values worth offering this player, carried from another competition run by
 * the same organization.
 *
 * A suggestion, never a stored answer — see migration 0106. Returned
 * separately from their real answers so the form can say which is which: an
 * address that arrived from last season should be looked at before it is
 * submitted again, and a field that silently filled itself in is the one
 * nobody checks.
 */
export async function getSuggestedPlayerAnswers(
  competitionId: string,
): Promise<AnswerMap> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("suggested_player_answers", {
    _competition_id: competitionId,
  });
  return Object.fromEntries(
    ((data ?? []) as { question_id: string; value: string }[]).map((r) => [
      r.question_id,
      r.value,
    ]),
  );
}

/**
 * Which required player questions this person still owes.
 *
 * Answered by the database rather than recomputed here, because the same rule
 * decides whether the waiver step opens and a second implementation of
 * "does a follow-up count yet" is a second chance to get it wrong.
 */
export async function countUnansweredPlayerQuestions(
  competitionId: string,
): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("unanswered_player_questions", {
    _competition_id: competitionId,
  });
  return typeof data === "number" ? data : 0;
}

/**
 * Every player's answers for a competition, for the organizer's export.
 *
 * Admin-only by RLS — the select policy on `registration_answers` returns a
 * player's own rows to them and everything to a competition admin, so an
 * ordinary member calling this gets their own answers and nothing else.
 */
export type AnswerRow = {
  userId: string | null;
  teamId: string | null;
  name: string;
  email: string | null;
  answers: AnswerMap;
};

export async function getAllAnswers(
  competitionId: string,
): Promise<AnswerRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("registration_answers")
    .select("question_id, value, user_id, team_id, users(display_name, email)")
    .eq("competition_id", competitionId);

  const rows = (data ?? []) as unknown as {
    question_id: string;
    value: string;
    user_id: string | null;
    team_id: string | null;
    users: { display_name: string | null; email: string | null } | null;
  }[];

  const bySubject = new Map<string, AnswerRow>();
  for (const r of rows) {
    const key = r.user_id ?? `team:${r.team_id}`;
    let row = bySubject.get(key);
    if (!row) {
      row = {
        userId: r.user_id,
        teamId: r.team_id,
        name: r.users?.display_name ?? "",
        email: r.users?.email ?? null,
        answers: {},
      };
      bySubject.set(key, row);
    }
    row.answers[r.question_id] = r.value;
  }
  return [...bySubject.values()];
}
