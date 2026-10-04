import "server-only";

import {
  getCompetitionOrgNames,
  getMyCompetitions,
  getMyPoolSignups,
  isCompetitionDone,
} from "@/lib/queries/dashboard";
import {
  getMyPlayerAnswers,
  getRegistrationQuestions,
  getSuggestedPlayerAnswers,
  type AnswerMap,
  type RegistrationQuestion,
} from "@/lib/queries/registration-questions";

export interface MyLeagueDetails {
  competitionId: string;
  name: string;
  orgName: string;
  /** In the pool waiting to be placed, or on a roster. */
  context: "pool" | "team";
  questions: RegistrationQuestion[];
  answers: AnswerMap;
  suggested: AnswerMap;
}

/**
 * The signed-in player's answers to every league that asks them anything —
 * leagues they're in the pool for, and leagues they're rostered in that
 * aren't finished.
 *
 * Shared by the dashboard (which shows only the ones with a required answer
 * missing) and the profile (which shows them all, so details can be kept
 * current). BVL, 2026-10-04: a player looked for "where can I edit these
 * details" under Profile, and there was nothing there — once the dashboard
 * form was complete it disappeared and the answers were out of reach.
 */
export async function getMyLeagueDetails(): Promise<MyLeagueDetails[]> {
  const [pool, comps] = await Promise.all([
    getMyPoolSignups(),
    getMyCompetitions(),
  ]);
  const active = comps.filter((c) => !isCompetitionDone(c));
  const orgNames = await getCompetitionOrgNames(
    active.map((c) => c.competitionId),
  );

  const candidates = [
    ...pool.map((p) => ({
      competitionId: p.competitionId,
      name: p.name,
      orgName: p.orgName,
      context: "pool" as const,
    })),
    ...active.map((c) => ({
      competitionId: c.competitionId,
      name: c.name,
      orgName: orgNames.get(c.competitionId) ?? "Your organizer",
      context: "team" as const,
    })),
  ].filter(
    (c, i, all) =>
      all.findIndex((x) => x.competitionId === c.competitionId) === i,
  );

  const all = await Promise.all(
    candidates.map(async (c) => {
      const [questions, answers, suggested] = await Promise.all([
        getRegistrationQuestions(c.competitionId, "player"),
        getMyPlayerAnswers(c.competitionId),
        getSuggestedPlayerAnswers(c.competitionId),
      ]);
      return { ...c, questions, answers, suggested };
    }),
  );
  return all.filter((d) => d.questions.length > 0);
}
