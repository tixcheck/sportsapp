/**
 * League rules (0188): one league's for its Rules tab, and every league the
 * signed-in user is part of for the Help assistant. Read with the caller's own
 * client, so RLS decides what each person can see.
 */
import { createClient } from "@/lib/supabase/server";
import { parseRules, type RuleSection } from "@/lib/competition/rules";
import { getMyCompetitions, getMyPoolSignups } from "@/lib/queries/dashboard";
import {
  getHelperCompetitions,
  getMyScorekeeping,
} from "@/lib/queries/organizers";

export async function getCompetitionRules(
  competitionId: string,
): Promise<RuleSection[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("competitions")
    .select("rules")
    .eq("id", competitionId)
    .maybeSingle();
  return parseRules((data as { rules?: unknown } | null)?.rules);
}

export interface LeagueRules {
  competitionId: string;
  name: string;
  rules: RuleSection[];
}

/**
 * Rules of every running league the user plays in, waits to be drafted into,
 * keeps score for or helps run. A player asking the Help chat about "the
 * rules" means their own league's, so only those are given to it — not every
 * public league's.
 */
export async function getMyLeagueRules(): Promise<LeagueRules[]> {
  const [comps, pool, scoring, helping] = await Promise.all([
    getMyCompetitions(),
    getMyPoolSignups(),
    getMyScorekeeping(),
    getHelperCompetitions(),
  ]);
  const ids = [
    ...new Set([
      ...comps.map((c) => c.competitionId),
      ...pool.map((p) => p.competitionId),
      ...scoring.map((s) => s.competitionId),
      ...helping.map((h) => h.competitionId),
    ]),
  ];
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("competitions")
    .select("id, name, status, rules")
    .in("id", ids)
    .not("rules", "is", null);
  return (
    (data ?? []) as {
      id: string;
      name: string;
      status: string;
      rules: unknown;
    }[]
  )
    .filter((c) => c.status !== "completed" && c.status !== "cancelled")
    .map((c) => ({
      competitionId: c.id,
      name: c.name,
      rules: parseRules(c.rules),
    }))
    .filter((c) => c.rules.length > 0);
}
