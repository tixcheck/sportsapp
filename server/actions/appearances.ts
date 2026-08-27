"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

type ActionError = { error: string };

const playerSchema = z.object({
  /** Null for someone playing without an account — a sub off the list. */
  userId: z.string().uuid().nullable(),
  name: z.string().trim().min(1, "Every player needs a name.").max(80),
  role: z.enum(["rostered", "sub"]).default("rostered"),
});

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
  const guestNames = players
    .filter((p) => p.userId === null)
    .map((p) => p.name.trim().toLowerCase().replace(/\s+/g, " "));
  if (new Set(guestNames).size !== guestNames.length) {
    return {
      error: "Two players share a name — add an initial to tell them apart.",
    };
  }

  const { error: delErr } = await supabase
    .from("match_appearances")
    .delete()
    .eq("match_id", matchId)
    .eq("team_id", teamId);
  if (delErr) {
    console.error("[appearances] clear failed", delErr.message);
    return { error: "That couldn't be saved. Please try again." };
  }

  if (players.length > 0) {
    const { error: insErr } = await supabase.from("match_appearances").insert(
      players.map((p) => ({
        competition_id: m.competition_id,
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
  }

  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/orgs");
  return { saved: players.length };
}
