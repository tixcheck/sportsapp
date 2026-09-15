"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  matchesForTeamOnNight,
  type NightMatch,
} from "@/lib/stats/night-lineup";
import { identityKey } from "@/lib/stats/attribution";

type ActionError = { error: string };

const playerSchema = z.object({
  /** Null for someone playing without an account — a sub off the list. */
  userId: z.string().uuid().nullable(),
  name: z.string().trim().min(1, "Every player needs a name.").max(80),
  role: z.enum(["rostered", "sub"]).default("rostered"),
});

const nightSchema = z.object({
  competitionId: z.string().uuid(),
  teamId: z.string().uuid(),
  /** `yyyy-MM-dd` in the competition's timezone. */
  night: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a night."),
  players: z.array(playerSchema).max(30),
});

export type NightLineupInput = z.input<typeof nightSchema>;

const schema = z.object({
  matchId: z.string().uuid(),
  teamId: z.string().uuid(),
  /** The full lineup for this team in this match. Replaces what was there. */
  players: z.array(playerSchema).max(30),
});

export type AppearanceInput = z.input<typeof schema>;

/**
 * Record who played for one team in one match.
 *
 * Replace-the-whole-lineup rather than add/remove one at a time: the organizer
 * is working from a sheet and thinking "these six played", and a diffing API
 * would make an unticked box ambiguous between "not yet marked" and "did not
 * play". Deleting and re-inserting makes the stored row say exactly what the
 * screen says.
 *
 * Absence is not stored. A rostered player who isn't in this list simply has no
 * appearance, and the stats never see them for this match — which is the whole
 * mechanism behind subbing someone out.
 */
export async function setMatchAppearancesAction(
  input: AppearanceInput,
): Promise<ActionError | { saved: number }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the lineup." };
  }
  const { matchId, teamId, players } = parsed.data;

  const supabase = await createClient();

  // The people who may say what the score was are the people who may say who
  // played. RLS enforces the same rule on the table.
  const { data: allowed, error: checkErr } = await supabase.rpc(
    "can_enter_score",
    { _match_id: matchId },
  );
  if (checkErr) {
    console.error("[appearances] permission check failed", checkErr.message);
    return { error: "That couldn't be saved. Please try again." };
  }
  if (allowed !== true) {
    return { error: "You're not allowed to record the lineup for this match." };
  }

  const { data: match } = await supabase
    .from("matches")
    .select("competition_id, home_team_id, away_team_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return { error: "Match not found." };
  const m = match as {
    competition_id: string;
    home_team_id: string | null;
    away_team_id: string | null;
  };
  if (teamId !== m.home_team_id && teamId !== m.away_team_id) {
    return { error: "That team isn't playing in this match." };
  }

  // Two people with the same name and no account would collide on the unique
  // index and fail the whole insert; say so plainly rather than surfacing a
  // constraint violation.
  const duplicate = duplicateGuestName(players);
  if (duplicate) return { error: duplicate };

  const failure = await writeLineup(
    supabase,
    m.competition_id,
    matchId,
    teamId,
    players,
  );
  if (failure) return failure;

  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/orgs");
  return { saved: players.length };
}

/**
 * Record one team's lineup for a whole NIGHT.
 *
 * This is the way subbing actually works: someone fills in for the evening, not
 * for game four. Ticking the same six people once per match would be an
 * interface shaped by the storage rather than by what happened — so the night
 * is the unit of input, and it fans out across that team's games.
 *
 * The per-match rows stay, because `0089_appearances.sql` chose that grain so a
 * player arriving after game two can be credited with the four they played.
 * Writing a night at a time does not give that up; it just declines to ask for
 * it every week.
 *
 * All-or-nothing on permission: if the caller cannot score one of the night's
 * matches they cannot set the lineup for any of them. A half-recorded night is
 * worse than a refused one, because the stats would silently count some games
 * and not others.
 */
export async function setNightLineupAction(
  input: NightLineupInput,
): Promise<ActionError | { matches: number; players: number }> {
  const parsed = nightSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the lineup." };
  }
  const { competitionId, teamId, night, players } = parsed.data;

  const duplicate = duplicateGuestName(players);
  if (duplicate) return { error: duplicate };

  const supabase = await createClient();

  const { data: comp } = await supabase
    .from("competitions")
    .select("timezone")
    .eq("id", competitionId)
    .maybeSingle();
  if (!comp) return { error: "Competition not found." };
  const timezone =
    (comp as { timezone: string | null }).timezone ?? "America/Toronto";

  const { data: rows } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id, scheduled_at")
    .eq("competition_id", competitionId);

  const matches: NightMatch[] = (
    (rows ?? []) as {
      id: string;
      home_team_id: string | null;
      away_team_id: string | null;
      scheduled_at: string | null;
    }[]
  ).map((r) => ({
    id: r.id,
    homeTeamId: r.home_team_id,
    awayTeamId: r.away_team_id,
    scheduledAt: r.scheduled_at,
  }));

  const matchIds = matchesForTeamOnNight(matches, teamId, night, timezone);
  if (matchIds.length === 0) {
    return { error: "That team has no games that night." };
  }

  // Check every match BEFORE writing any, so a refusal leaves nothing behind.
  for (const matchId of matchIds) {
    const { data: allowed, error } = await supabase.rpc("can_enter_score", {
      _match_id: matchId,
    });
    if (error) {
      console.error("[appearances] permission check failed", error.message);
      return { error: "That couldn't be saved. Please try again." };
    }
    if (allowed !== true) {
      return { error: "You're not allowed to record lineups for this team." };
    }
  }

  for (const matchId of matchIds) {
    const failure = await writeLineup(
      supabase,
      competitionId,
      matchId,
      teamId,
      players,
    );
    if (failure) return failure;
  }

  revalidatePath("/orgs");
  return { matches: matchIds.length, players: players.length };
}

/** Two accountless players sharing a name collide on the unique index. */
function duplicateGuestName(
  players: { userId: string | null; name: string }[],
): string | null {
  const names = players
    .filter((p) => p.userId === null)
    .map((p) => p.name.trim().toLowerCase().replace(/\s+/g, " "));
  return new Set(names).size === names.length
    ? null
    : "Two players share a name — add an initial to tell them apart.";
}

/**
 * Replace one team's lineup for one match. Shared by both entry points so the
 * night path and the match path cannot drift into storing different things.
 *
 * Absences are rewritten with the lineup (migration 0121). Ticking somebody
 * back in has to clear the night they were marked missing, so they are never
 * left over from a previous save.
 */
async function writeLineup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitionId: string,
  matchId: string,
  teamId: string,
  players: { userId: string | null; name: string; role: "rostered" | "sub" }[],
): Promise<ActionError | null> {
  const { error: delErr } = await supabase
    .from("match_appearances")
    .delete()
    .eq("match_id", matchId)
    .eq("team_id", teamId);
  if (delErr) {
    console.error("[appearances] clear failed", delErr.message);
    return { error: "That couldn't be saved. Please try again." };
  }

  const { error: absDelErr } = await supabase
    .from("match_absences")
    .delete()
    .eq("match_id", matchId)
    .eq("team_id", teamId);
  if (absDelErr) {
    console.error("[appearances] absence clear failed", absDelErr.message);
    return { error: "That couldn't be saved. Please try again." };
  }

  // An empty lineup means "not recorded yet", never "everybody stayed home".
  // Reading it the second way would mark a whole team missing for a night
  // nobody has filled in.
  if (players.length === 0) return null;

  const { error: insErr } = await supabase.from("match_appearances").insert(
    players.map((p) => ({
      competition_id: competitionId,
      match_id: matchId,
      team_id: teamId,
      user_id: p.userId,
      player_name: p.name.trim(),
      role: p.role,
    })),
  );
  if (insErr) {
    console.error("[appearances] insert failed", insErr.message);
    return { error: "That couldn't be saved. Please try again." };
  }

  await recordAbsences(supabase, competitionId, matchId, teamId, players);
  return null;
}

/**
 * Write down who from the team's roster was NOT in this lineup.
 *
 * The roster is the union the lineup screen shows: `team_members` for people
 * with accounts, plus players drafted onto the team, most of whom have none
 * (`place_free_agents` only writes a member row for an account). Reading
 * `team_members` alone would record nobody missing in a drafted league.
 *
 * Best-effort. The lineup itself is already saved, and failing the whole save
 * over a secondary statistic would tell the organizer their lineup was lost
 * when it wasn't — so a failure here is logged, not returned.
 */
async function recordAbsences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitionId: string,
  matchId: string,
  teamId: string,
  players: { userId: string | null; name: string }[],
): Promise<void> {
  const [{ data: members }, { data: drafted }] = await Promise.all([
    supabase
      .from("team_members")
      .select("user_id, users(display_name)")
      .eq("team_id", teamId),
    supabase
      .from("free_agents")
      .select("user_id, name")
      .eq("competition_id", competitionId)
      .eq("placed_team_id", teamId)
      .eq("status", "placed"),
  ]);

  const roster = new Map<string, { userId: string | null; name: string }>();
  for (const m of (members ?? []) as unknown as {
    user_id: string;
    users:
      | { display_name: string | null }
      | { display_name: string | null }[]
      | null;
  }[]) {
    const u = Array.isArray(m.users) ? m.users[0] : m.users;
    const person = {
      userId: m.user_id,
      name: u?.display_name?.trim() || "Player",
    };
    roster.set(
      identityKey({ userId: person.userId, playerName: person.name }),
      person,
    );
  }
  for (const d of (drafted ?? []) as {
    user_id: string | null;
    name: string;
  }[]) {
    const person = { userId: d.user_id, name: d.name.trim() };
    const key = identityKey({ userId: person.userId, playerName: person.name });
    // A drafted player with an account is already here from team_members.
    if (!roster.has(key)) roster.set(key, person);
  }

  const present = new Set(
    players.map((p) => identityKey({ userId: p.userId, playerName: p.name })),
  );
  const rows = [...roster.entries()]
    .filter(([key]) => !present.has(key))
    .map(([, p]) => ({
      competition_id: competitionId,
      match_id: matchId,
      team_id: teamId,
      user_id: p.userId,
      player_name: p.name,
    }));
  if (rows.length === 0) return;

  const { error } = await supabase.from("match_absences").insert(rows);
  if (error)
    console.error("[appearances] absence insert failed", error.message);
}
