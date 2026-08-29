"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { slugify, uniqueSlug } from "@/lib/utils/slug";
import {
  generateReversePairs,
  reversePairsProblem,
} from "@/lib/scheduler/reverse-pairs";

const DEFAULT_TIMEZONE = "America/Toronto";

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

const createSchema = z.object({
  name: z.string().trim().min(2, "Name is too short.").max(100),
  sport: z.enum(["indoor6", "beach2", "coed4"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  venue: z.string().trim().max(120).optional(),
  courts: z.number().int().min(1).max(12),
  minutesPerGame: z.number().int().min(5).max(120),
  pointsPerGame: z.number().int().min(5).max(99),
});

export type CreateReversePairsInput = z.input<typeof createSchema>;

/**
 * Create a Reverse Pairs event.
 *
 * No rounds here on purpose. The round count depends on how many pairs turn up,
 * and that isn't known at creation — twelve pairs and sixteen pairs want
 * different nights on the same two courts. The draw panel works it out once the
 * field is in, and suggests the counts that divide evenly.
 *
 * Starts private, like a league does: an event with no pairs in it is not ready
 * to be found.
 */
export async function createReversePairsAction(
  orgId: string,
  values: CreateReversePairsInput,
): Promise<ActionError | { competitionId: string }> {
  const parsed = createSchema.safeParse(values);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const base = slugify(v.name);
  const { data: existing } = await supabase
    .from("competitions")
    .select("slug")
    .or(`slug.eq.${base},slug.like.${base}-%`);
  const slug = uniqueSlug(base, new Set((existing ?? []).map((r) => r.slug)));

  const { data: comp, error } = await supabase
    .from("competitions")
    .insert({
      org_id: orgId,
      slug,
      name: v.name,
      type: "reverse_pairs",
      sport: v.sport,
      status: "draft",
      start_date: v.date,
      end_date: v.date,
      venue: v.venue || null,
      timezone: DEFAULT_TIMEZONE,
      // One game to a points target, played out — the margin is the result, so
      // there is no best-of and no win-by to reason about.
      match_format: {
        bestOf: 1,
        setsToPoints: [v.pointsPerGame],
        winBy: 1,
      },
      visibility: "private",
    })
    .select("id")
    .single();
  if (error || !comp) {
    return { error: error?.message ?? "Could not create the event." };
  }

  // Rounds get a placeholder until there is a field to draw. The draw panel
  // overwrites it, and nothing reads it before then.
  const { error: setErr } = await supabase
    .from("reverse_pairs_settings")
    .insert({
      competition_id: comp.id,
      courts: v.courts,
      rounds: 8,
      seed: 1,
      minutes_per_game: v.minutesPerGame,
    });
  if (setErr) return { error: setErr.message };

  revalidatePath("/orgs");
  return { competitionId: comp.id as string };
}

const pairSchema = z.object({
  competitionId: idSchema,
  /** "Sam & Mel" — one entry per pair, however the organizer writes it. */
  names: z.array(z.string().trim().min(1).max(80)).min(1).max(200),
});

export type AddReversePairsInput = z.input<typeof pairSchema>;

/**
 * Add pairs to the field.
 *
 * Takes a list rather than one at a time, because an organizer arrives with a
 * registration list and typing sixteen names through sixteen round trips is the
 * manual work this is meant to remove.
 *
 * Names already in the field are skipped rather than rejected: pasting a list
 * twice should not fail, and it should not produce two of everybody either.
 */
export async function addReversePairsAction(
  input: AddReversePairsInput,
): Promise<ActionError | { added: number; skipped: number }> {
  const parsed = pairSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the names." };
  }
  const { competitionId, names } = parsed.data;

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) return { error: "Only the organizer can add pairs." };

  const { data: current } = await supabase
    .from("teams")
    .select("name")
    .eq("competition_id", competitionId);
  const taken = new Set(
    (current ?? []).map((t) => (t.name as string).trim().toLowerCase()),
  );

  const fresh: string[] = [];
  for (const raw of names) {
    const key = raw.toLowerCase();
    if (taken.has(key)) continue;
    taken.add(key);
    fresh.push(raw);
  }

  if (fresh.length > 0) {
    const { error } = await supabase.from("teams").insert(
      fresh.map((name) => ({
        competition_id: competitionId,
        name,
        status: "active" as const,
      })),
    );
    if (error) {
      console.error("[reverse-pairs] add pairs failed", error.message);
      return { error: "Those pairs couldn't be added." };
    }
  }

  revalidatePath("/orgs");
  return { added: fresh.length, skipped: names.length - fresh.length };
}

/** Remove a pair from the field. Refuses once a schedule exists. */
export async function removeReversePairAction(
  teamId: string,
): Promise<ActionError | { removed: true }> {
  if (!idSchema.safeParse(teamId).success) return { error: "Unknown pair." };

  const supabase = await createClient();
  const { data: team } = await supabase
    .from("teams")
    .select("competition_id")
    .eq("id", teamId)
    .maybeSingle();
  if (!team) return { error: "Pair not found." };

  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: team.competition_id,
  });
  if (isAdmin !== true)
    return { error: "Only the organizer can remove pairs." };

  // Deleting a pair mid-schedule would cascade their lineups away and leave
  // games with two a side. Redraw first — which is cheap, and honest about
  // what removing somebody actually costs.
  const { count } = await supabase
    .from("reverse_pairs_games")
    .select("id", { count: "exact", head: true })
    .eq("competition_id", team.competition_id);
  if ((count ?? 0) > 0) {
    return {
      error:
        "There's a schedule drawn. Remove the pair after redrawing, or redraw once they're gone.",
    };
  }

  const { error } = await supabase.from("teams").delete().eq("id", teamId);
  if (error) return { error: "That pair couldn't be removed." };

  revalidatePath("/orgs");
  return { removed: true };
}
