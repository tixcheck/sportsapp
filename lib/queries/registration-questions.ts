import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  tallyLocalities,
  type AddressMetadata,
} from "@/lib/registration/locality";
import {
  choiceColumns,
  tallyChoices,
  type ChoiceTally,
} from "@/lib/registration/roster-mix";
import { getPlayerNameAnswers, namePartsFor } from "@/lib/queries/player-names";
import { resolvePlayerName } from "@/lib/registration/player-name";

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
  // The export's Name column was the account name while the First/Last columns
  // beside it said something fuller — the same row disagreeing with itself.
  const [{ data }, names] = await Promise.all([
    supabase
      .from("registration_answers")
      .select(
        "question_id, value, user_id, team_id, users(display_name, email)",
      )
      .eq("competition_id", competitionId),
    getPlayerNameAnswers(competitionId),
  ]);

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
        name: r.user_id
          ? resolvePlayerName(
              namePartsFor(
                names,
                r.user_id,
                r.users?.display_name ?? null,
                r.users?.email ?? null,
              ),
            )
          : (r.users?.display_name ?? ""),
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

/**
 * Everything needed to say what stage each team's registration is at.
 *
 * Assembled in one place rather than per team, because a Teams tab with
 * fifteen teams would otherwise be sixty round trips — and the organizer
 * scanning it is looking for the one or two rows that need them.
 */
export type TeamStageFacts = {
  teamId: string;
  status: string;
  paidCents: number;
  hasUnconfirmedPayment: boolean;
  rosterSize: number;
  signed: number;
};

export async function getTeamStageFacts(competitionId: string): Promise<{
  feeCents: number;
  minRoster: number | null;
  waiverRequired: boolean;
  /** Everyone who has signed, so a roster can be marked person by person. */
  signedUserIds: Set<string>;
  byTeam: Map<string, TeamStageFacts>;
}> {
  const supabase = await createClient();

  const [{ data: comp }, { data: settings }] = await Promise.all([
    supabase
      .from("competitions")
      .select("waiver_id, min_roster_for_entry")
      .eq("id", competitionId)
      .maybeSingle(),
    supabase
      .from("competition_payment_settings")
      .select("registration_fee_cents")
      .eq("competition_id", competitionId)
      .maybeSingle(),
  ]);

  const waiverId = (comp as { waiver_id: string | null } | null)?.waiver_id;
  const minRoster =
    (comp as { min_roster_for_entry: number | null } | null)
      ?.min_roster_for_entry ?? null;
  const feeCents =
    (settings as { registration_fee_cents: number } | null)
      ?.registration_fee_cents ?? 0;

  const { data: teams } = await supabase
    .from("teams")
    .select("id, status, team_members(user_id)")
    .eq("competition_id", competitionId);

  const rows = (teams ?? []) as unknown as {
    id: string;
    status: string;
    team_members: { user_id: string }[] | null;
  }[];

  const [{ data: payments }, { data: signatures }] = await Promise.all([
    supabase
      .from("registration_payments")
      .select("team_id, status, price_cents, method")
      .eq("competition_id", competitionId),
    waiverId
      ? supabase
          .from("waiver_acceptances")
          .select("user_id")
          .eq("competition_id", competitionId)
          .eq("waiver_id", waiverId)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
  ]);

  const signedUsers = new Set(
    ((signatures ?? []) as { user_id: string }[]).map((s) => s.user_id),
  );

  const paidByTeam = new Map<string, number>();
  const unconfirmed = new Set<string>();
  for (const p of (payments ?? []) as {
    team_id: string | null;
    status: string;
    price_cents: number;
    method: string;
  }[]) {
    if (!p.team_id) continue;
    if (p.status === "paid") {
      paidByTeam.set(
        p.team_id,
        (paidByTeam.get(p.team_id) ?? 0) + p.price_cents,
      );
    } else if (p.status === "pending" && p.method !== "card") {
      // Only an OFFLINE pending payment is the organizer's to check. A card
      // checkout somebody abandoned needs nothing from them.
      unconfirmed.add(p.team_id);
    }
  }

  const byTeam = new Map<string, TeamStageFacts>();
  for (const t of rows) {
    const members = t.team_members ?? [];
    byTeam.set(t.id, {
      teamId: t.id,
      status: t.status,
      paidCents: paidByTeam.get(t.id) ?? 0,
      hasUnconfirmedPayment: unconfirmed.has(t.id),
      rosterSize: members.length,
      signed: members.filter((m) => signedUsers.has(m.user_id)).length,
    });
  }

  return {
    feeCents,
    minRoster,
    waiverRequired: !!waiverId,
    signedUserIds: signedUsers,
    byTeam,
  };
}

/** One multiple-choice question, tallied across every team. */
export type ChoiceQuestionMix = {
  questionId: string;
  label: string;
  /** The organizer's declared options, in their order. */
  options: string[];
  /** Table headings: declared options, then any answer that outlived an edit. */
  columns: string[];
  teams: { teamId: string; teamName: string; tally: ChoiceTally }[];
};

/**
 * Every per-player multiple-choice question, split by team.
 *
 * Brampton's reason for wanting this is the sex split — a co-ed team that
 * turns up with no women cannot field a legal lineup — but nothing here looks
 * for a question about sex. Any `select` asked of every player is tallied and
 * the organizer reads the one they need; see `lib/registration/roster-mix.ts`
 * for why matching on the label would be worse than useless.
 *
 * Counts only, never who answered what. The organizer can already see
 * individual answers elsewhere, so this adds no exposure — it just has no
 * reason to repeat it.
 */
export async function getTeamChoiceMix(
  competitionId: string,
): Promise<ChoiceQuestionMix[]> {
  const supabase = await createClient();

  const { data: questions } = await supabase
    .from("registration_questions")
    .select("id, label, options, position")
    .eq("competition_id", competitionId)
    .eq("scope", "player")
    .eq("kind", "select")
    .order("position");
  const qs = (questions ?? []) as {
    id: string;
    label: string;
    options: string[] | null;
  }[];
  if (qs.length === 0) return [];

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
  if (rosters.length === 0) return [];

  const { data: answers } = await supabase
    .from("registration_answers")
    .select("question_id, user_id, value")
    .eq("competition_id", competitionId)
    .in(
      "question_id",
      qs.map((q) => q.id),
    );

  // One lookup for every (question, player) rather than a filter per team —
  // nineteen teams by two questions is otherwise thirty-eight passes.
  const byKey = new Map<string, string>();
  for (const a of (answers ?? []) as {
    question_id: string;
    user_id: string | null;
    value: string | null;
  }[]) {
    if (!a.user_id) continue;
    byKey.set(`${a.question_id}:${a.user_id}`, a.value ?? "");
  }

  return qs.map((q) => {
    const options = q.options ?? [];
    const teamRows = rosters.map((t) => ({
      teamId: t.id,
      teamName: t.name,
      tally: tallyChoices(
        (t.team_members ?? []).map((m) => byKey.get(`${q.id}:${m.user_id}`)),
        options,
      ),
    }));
    return {
      questionId: q.id,
      label: q.label,
      options,
      columns: choiceColumns(
        teamRows.map((r) => r.tally),
        options,
      ),
      teams: teamRows,
    };
  });
}

/** One registered player, with everything the organizer holds about them. */
export type PlayerDirectoryRow = {
  /** Null for somebody drafted into the league who has no account. */
  userId: string | null;
  /**
   * The individual sign-up behind this row, when there is one - a drafted
   * player, or somebody still in the pool. Null for a player who joined a team
   * by invite. Present means the sign-up details are editable.
   */
  freeAgentId: string | null;
  /**
   * The sign-up's status, when there is one. `available` / `pending_payment`
   * mean they are waiting in the pool with no team yet.
   */
  freeAgentStatus: string | null;
  /**
   * A `team_members` row exists for them in this competition.
   *
   * Not cosmetic: `my_competitions` is built entirely on that table, so a
   * placed player without one cannot see the league they are on. See
   * `lib/registration/player-access.ts`.
   */
  hasRosterRow: boolean;
  /** The name the league asked for — see `lib/registration/player-name.ts`. */
  name: string;
  /** What they chose to be called publicly, when it differs from `name`. */
  accountName: string | null;
  email: string | null;
  teamId: string | null;
  teamName: string | null;
  answers: AnswerMap;
  /**
   * What the draft pool holds instead of registration answers.
   *
   * A drafted player without an account has no `registration_answers` at all —
   * answers are keyed by `user_id` — but the sign-up that put them in the pool
   * carries their phone, positions and grade. Showing that beats showing a row
   * of dashes against a real person.
   */
  draft: {
    /**
     * The name and email AS SIGNED UP. Not `name` above, which may be the
     * league's resolved name: an edit dialog seeded from that would
     * overwrite the sign-up with a different spelling on save.
     */
    name: string;
    email: string | null;
    phone: string | null;
    positions: string[];
    skillLevel: string | null;
    notes: string | null;
  } | null;
};

/**
 * Every player in a competition, with their answers — the organizer's people
 * list.
 *
 * Their league secretary's words: "access to player data (to add phone
 * numbers, tweak spellings, etc.)". Until now `getAllAnswers` existed for an
 * export that was never built, so an organizer could set the questions and
 * read none of the replies.
 *
 * MEMBERSHIP COMES FROM TWO PLACES and this reads both, which the first
 * version did not. `team_members` holds people with accounts — a captain's
 * invited teammates. `free_agents.placed_team_id` holds people the organizer
 * drafted, and `place_free_agents` only writes a `team_members` row when they
 * have an account. Big Shoots' four teams therefore read 0 members while
 * carrying 6 drafted players each, and a list built on `team_members` alone
 * showed the organizer an empty league. `lib/queries/lineups.ts` already takes
 * the union for exactly this reason; this now matches it.
 *
 * Admin-only by RLS: `registration_answers` returns a player their own rows
 * and an admin everything, so this reads thin for anyone else rather than
 * leaking.
 */
export async function getPlayerDirectory(
  competitionId: string,
): Promise<PlayerDirectoryRow[]> {
  const supabase = await createClient();

  const [{ data: teams }, { data: drafted }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, team_members(user_id, users(display_name, email))")
      .eq("competition_id", competitionId)
      .neq("status", "withdrawn")
      .order("name"),
    supabase
      .from("free_agents")
      .select(
        "id, user_id, name, email, phone, positions, skill_level, notes, status, placed_team_id",
      )
      .eq("competition_id", competitionId)
      .neq("status", "withdrawn"),
  ]);

  const rosters = (teams ?? []) as unknown as {
    id: string;
    name: string;
    team_members:
      | {
          user_id: string;
          users: { display_name: string | null; email: string | null } | null;
        }[]
      | null;
  }[];

  const [{ data: answerRows }, names] = await Promise.all([
    supabase
      .from("registration_answers")
      .select("question_id, value, user_id")
      .eq("competition_id", competitionId)
      .not("user_id", "is", null),
    getPlayerNameAnswers(competitionId),
  ]);

  const byUser = new Map<string, AnswerMap>();
  for (const a of (answerRows ?? []) as {
    question_id: string;
    value: string;
    user_id: string;
  }[]) {
    const map = byUser.get(a.user_id) ?? {};
    map[a.question_id] = a.value;
    byUser.set(a.user_id, map);
  }

  const teamName = new Map(rosters.map((t) => [t.id, t.name]));
  const out: PlayerDirectoryRow[] = [];
  const seen = new Set<string>();

  for (const team of rosters) {
    for (const m of team.team_members ?? []) {
      const accountName = m.users?.display_name ?? null;
      const email = m.users?.email ?? null;
      const name = resolvePlayerName(
        namePartsFor(names, m.user_id, accountName, email),
      );
      seen.add(m.user_id);
      out.push({
        userId: m.user_id,
        freeAgentId: null,
        freeAgentStatus: null,
        name,
        // Only worth carrying when it says something the name doesn't.
        accountName:
          accountName && accountName.trim() !== name ? accountName : null,
        email,
        teamId: team.id,
        teamName: team.name,
        // This loop IS `team_members`, so by construction.
        hasRosterRow: true,
        answers: byUser.get(m.user_id) ?? {},
        draft: null,
      });
    }
  }

  for (const fa of (drafted ?? []) as {
    id: string;
    user_id: string | null;
    name: string;
    email: string | null;
    phone: string | null;
    positions: string[] | null;
    skill_level: string | null;
    notes: string | null;
    status: string;
    placed_team_id: string | null;
  }[]) {
    const draft = {
      name: fa.name,
      email: fa.email,
      phone: fa.phone,
      positions: fa.positions ?? [],
      skillLevel: fa.skill_level,
      notes: fa.notes,
    };

    // Somebody drafted who DOES have an account already came through
    // `team_members` above; listing them twice would be worse than either.
    // Point that row at the sign-up instead, so its details are editable too.
    if (fa.user_id && seen.has(fa.user_id)) {
      const existing = out.find((r) => r.userId === fa.user_id);
      if (existing && !existing.freeAgentId) {
        existing.freeAgentId = fa.id;
        existing.freeAgentStatus = fa.status;
        existing.draft = draft;
      }
      continue;
    }

    // Placed onto a team that has since been withdrawn: not a roster spot, and
    // not waiting in the pool either.
    if (fa.placed_team_id && !teamName.has(fa.placed_team_id)) continue;

    // Waiting in the pool (available, or signed up but unpaid) belongs here
    // too. The organizer's words: "where are the individual registrants
    // sitting? I don't see them in the players tab."
    out.push({
      userId: fa.user_id,
      freeAgentId: fa.id,
      freeAgentStatus: fa.status,
      name: fa.name,
      accountName: null,
      email: fa.email,
      teamId: fa.placed_team_id,
      teamName: fa.placed_team_id
        ? (teamName.get(fa.placed_team_id) ?? null)
        : null,
      // Anyone with a roster row was merged into an existing row above and
      // `continue`d, so reaching here means there isn't one.
      hasRosterRow: false,
      answers: fa.user_id ? (byUser.get(fa.user_id) ?? {}) : {},
      draft,
    });
  }

  // Teams first, alphabetically; the pool after them - they are the people
  // still to be placed, and read as a group of their own.
  return out.sort(
    (a, b) =>
      Number(a.teamName == null) - Number(b.teamName == null) ||
      (a.teamName ?? "").localeCompare(b.teamName ?? "") ||
      a.name.localeCompare(b.name),
  );
}
