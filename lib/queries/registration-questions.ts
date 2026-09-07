import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  tallyLocalities,
  type AddressMetadata,
} from "@/lib/registration/locality";

export type QuestionKind =
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "select"
  | "yes_no"
  | "address";

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

export type TeamLocalityRow = {
  teamId: string;
  teamName: string;
  home: number;
  away: number;
  unknown: number;
  total: number;
};

/**
 * Where each team's players live, against the competition's home town.
 *
 * Answers to EVERY address question are considered, not one nominated field:
 * an organizer may ask for a home address and a mailing address, and the first
 * one a player filled in is the one to count rather than none of them.
 *
 * Returns an empty list when no home town is set or nobody has been asked for
 * an address — the card that renders this then shows nothing at all, which is
 * right for the competitions this doesn't apply to.
 */
export async function getTeamLocalities(competitionId: string): Promise<{
  /** The town in force, whether set here or inherited. */
  homeCity: string | null;
  /** The organization's default, so the card can say where it came from. */
  orgCity: string | null;
  /** This competition's own override, null when it simply inherits. */
  ownCity: string | null;
  teams: TeamLocalityRow[];
}> {
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from("competitions")
    .select("home_locality, organizations(home_locality)")
    .eq("id", competitionId)
    .maybeSingle();

  const row = comp as {
    home_locality: string | null;
    organizations: { home_locality: string | null } | null;
  } | null;

  const ownCity = row?.home_locality ?? null;
  const orgCity = row?.organizations?.home_locality ?? null;
  // The competition's own value wins; otherwise it follows its organization.
  // A competition nobody has touched therefore inherits, which is what makes
  // setting it once on the org reach the four leagues that already exist.
  const homeCity = ownCity ?? orgCity;

  if (!homeCity) return { homeCity: null, orgCity, ownCity, teams: [] };

  const { data: questions } = await supabase
    .from("registration_questions")
    .select("id")
    .eq("competition_id", competitionId)
    .eq("scope", "player")
    .eq("kind", "address");
  const addressQuestionIds = (questions ?? []).map((q) => q.id as string);
  if (addressQuestionIds.length === 0)
    return { homeCity, orgCity, ownCity, teams: [] };

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, team_members(user_id)")
    .eq("competition_id", competitionId)
    .neq("status", "withdrawn")
    .order("name");
  const rosters = (teams ?? []) as unknown as {
    id: string;
    name: string;
    team_members: { user_id: string }[] | null;
  }[];
  if (rosters.length === 0) return { homeCity, orgCity, ownCity, teams: [] };

  const { data: answers } = await supabase
    .from("registration_answers")
    .select("user_id, value, metadata")
    .eq("competition_id", competitionId)
    .in("question_id", addressQuestionIds);

  // First non-empty answer per person. A second address question is extra
  // detail, not a second person.
  const byUser = new Map<
    string,
    { answer: string; metadata: AddressMetadata }
  >();
  for (const a of (answers ?? []) as {
    user_id: string | null;
    value: string;
    metadata: AddressMetadata | null;
  }[]) {
    if (!a.user_id || byUser.has(a.user_id)) continue;
    if (!a.value?.trim()) continue;
    byUser.set(a.user_id, { answer: a.value, metadata: a.metadata ?? {} });
  }

  return {
    homeCity,
    orgCity,
    ownCity,
    teams: rosters.map((t) => {
      const people = (t.team_members ?? []).map(
        (m) => byUser.get(m.user_id) ?? { answer: "", metadata: {} },
      );
      const tally = tallyLocalities(people, homeCity);
      return { teamId: t.id, teamName: t.name, ...tally };
    }),
  };
}
