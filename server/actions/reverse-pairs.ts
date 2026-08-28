"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  generateReversePairs,
  reversePairsProblem,
} from "@/lib/scheduler/reverse-pairs";

type ActionError = { error: string };

const idSchema = z.string().uuid();

const generateSchema = z.object({
  competitionId: idSchema,
  courts: z.number().int().min(1).max(12),
  rounds: z.number().int().min(1).max(40),
  minutesPerGame: z.number().int().min(5).max(120),
  /** Reroll the draw. Omitted keeps the stored seed, so nothing moves. */
  reseed: z.boolean().optional(),
});

export type GenerateReversePairsInput = z.input<typeof generateSchema>;

/**
 * Draw a Reverse Pairs night.
 *
 * Replaces the whole schedule, because a Reverse Pairs draw is one object: the
 * partner balance is a property of the entire night, so regenerating half of it
 * would be meaningless. Scores go with it, which is why an existing set of
 * results has to be confirmed away rather than silently discarded.
 */
export async function generateReversePairsScheduleAction(
  input: GenerateReversePairsInput,
  options: { confirmName?: string } = {},
): Promise<
  | ActionError
  | { games: number; repeats: number; evenGames: boolean; gamesPerPair: number }
  | { needsConfirmation: true; played: number; name: string }
> {
  const parsed = generateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  }
  const { competitionId, courts, rounds, minutesPerGame, reseed } = parsed.data;

  const supabase = await createClient();
  const { data: isAdmin, error: checkErr } = await supabase.rpc(
    "is_competition_admin",
    { _competition_id: competitionId },
  );
  if (checkErr) {
    console.error("[reverse-pairs] permission check failed", checkErr.message);
    return { error: "That couldn't be saved. Please try again." };
  }
  if (isAdmin !== true) {
    return { error: "Only the organizer can draw the schedule." };
  }

  const { data: comp } = await supabase
    .from("competitions")
    .select("name, start_date, timezone")
    .eq("id", competitionId)
    .single();
  if (!comp) return { error: "Competition not found." };

  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("competition_id", competitionId)
    .neq("status", "pending_payment")
    .order("name");
  const pairIds = (teams ?? []).map((t) => t.id as string);

  const problem = reversePairsProblem(pairIds.length, courts, rounds);
  if (problem) return { error: problem };

  // Redrawing throws away every score, the same as regenerating a league
  // schedule. Typing the name is the lock, for the same reason.
  const { data: scored } = await supabase
    .from("reverse_pairs_games")
    .select("id")
    .eq("competition_id", competitionId)
    .not("score_a", "is", null);
  const played = (scored ?? []).length;
  if (
    played > 0 &&
    options.confirmName?.trim() !== (comp.name as string).trim()
  ) {
    return { needsConfirmation: true, played, name: comp.name as string };
  }

  const { data: existing } = await supabase
    .from("reverse_pairs_settings")
    .select("seed")
    .eq("competition_id", competitionId)
    .maybeSingle();
  const previousSeed = (existing?.seed as number | undefined) ?? 1;
  const seed = reseed ? (previousSeed % 1_000_000) + 1 : previousSeed;

  const draw = generateReversePairs({ pairIds, courts, rounds, seed });

  const { error: setErr } = await supabase
    .from("reverse_pairs_settings")
    .upsert(
      {
        competition_id: competitionId,
        courts,
        rounds,
        seed,
        minutes_per_game: minutesPerGame,
      },
      { onConflict: "competition_id" },
    );
  if (setErr) {
    console.error("[reverse-pairs] settings upsert failed", setErr.message);
    return { error: "Those settings couldn't be saved." };
  }

  const { error: delErr } = await supabase
    .from("reverse_pairs_games")
    .delete()
    .eq("competition_id", competitionId);
  if (delErr) return { error: delErr.message };

  // Round N starts N game-lengths after the first. Courts inside a round run at
  // once, which is the whole reason there is more than one.
  const tz = (comp.timezone as string | null) ?? "America/Toronto";
  const start = comp.start_date
    ? DateTime.fromISO(`${String(comp.start_date).slice(0, 10)}T19:00`, {
        zone: tz,
      })
    : null;

  const rows = draw.games.map((g) => ({
    competition_id: competitionId,
    game: g.game,
    court: g.court,
    scheduled_at:
      start && start.isValid
        ? start.plus({ minutes: (g.game - 1) * minutesPerGame }).toISO()
        : null,
  }));

  const { data: created, error: insErr } = await supabase
    .from("reverse_pairs_games")
    .insert(rows)
    .select("id, game, court");
  if (insErr) {
    console.error("[reverse-pairs] game insert failed", insErr.message);
    return { error: insErr.message };
  }

  const idBySlot = new Map(
    (created ?? []).map((r) => [`${r.game}:${r.court}`, r.id as string]),
  );
  const lineups = draw.games.flatMap((g) => {
    const gameId = idBySlot.get(`${g.game}:${g.court}`);
    if (!gameId) return [];
    return [
      ...g.teamA.map((team_id) => ({ game_id: gameId, team_id, side: "a" })),
      ...g.teamB.map((team_id) => ({ game_id: gameId, team_id, side: "b" })),
    ];
  });

  const { error: lineErr } = await supabase
    .from("reverse_pairs_lineups")
    .insert(lineups);
  if (lineErr) {
    console.error("[reverse-pairs] lineup insert failed", lineErr.message);
    return { error: lineErr.message };
  }

  revalidatePath("/orgs");
  return {
    games: draw.games.length,
    repeats: draw.quality.repeatPartnerships,
    evenGames: draw.quality.evenGames,
    gamesPerPair: draw.quality.minGames,
  };
}

const scoreSchema = z.object({
  gameId: idSchema,
  /** Both or neither — a half-entered score is not a result. */
  scoreA: z.number().int().min(0).max(199).nullable(),
  scoreB: z.number().int().min(0).max(199).nullable(),
});

export type ReversePairsScoreInput = z.input<typeof scoreSchema>;

/** Record (or clear) one game's score. */
export async function setReversePairsScoreAction(
  input: ReversePairsScoreInput,
): Promise<ActionError | { saved: true }> {
  const parsed = scoreSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the score." };
  }
  const { gameId, scoreA, scoreB } = parsed.data;
  if ((scoreA === null) !== (scoreB === null)) {
    return { error: "Enter both scores, or clear both." };
  }

  const supabase = await createClient();
  const { data: game } = await supabase
    .from("reverse_pairs_games")
    .select("competition_id")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) return { error: "Game not found." };

  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: game.competition_id,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can enter scores." };
  }

  const { error } = await supabase
    .from("reverse_pairs_games")
    .update({ score_a: scoreA, score_b: scoreB })
    .eq("id", gameId);
  if (error) {
    console.error("[reverse-pairs] score update failed", error.message);
    return { error: "That score couldn't be saved." };
  }

  revalidatePath("/orgs");
  return { saved: true };
}
