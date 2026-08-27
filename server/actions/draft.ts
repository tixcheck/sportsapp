"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

type ActionError = { error: string };

const idSchema = z.string().uuid();

const boardSchema = z.object({
  competitionId: idSchema,
  teams: z
    .array(
      z.object({
        /** Existing team, or null for one the organizer just added. */
        id: idSchema.nullable(),
        name: z.string().trim().min(1, "Every team needs a name.").max(80),
        playerIds: z.array(idSchema),
      }),
    )
    .max(16),
});

export type DraftBoardInput = z.input<typeof boardSchema>;

/**
 * Save a whole draft in one go.
 *
 * The board is the truth, not a list of edits. The organizer drags people
 * around until it looks right and then saves; sending each move as it happens
 * would mean a half-applied draft whenever the network hiccups, and would make
 * "drag Jon out of A and into B" two writes that can interleave badly.
 *
 * So this reconciles: anyone on a team in the board is placed there, and anyone
 * who was placed and is no longer on any team goes back to the pool. That makes
 * the saved state exactly what the screen showed.
 *
 * Teams are matched by id where the board has one and created otherwise, so a
 * re-draft can reuse the existing four rather than accumulating a new set every
 * three weeks.
 */
export async function saveDraftAction(
  input: DraftBoardInput,
): Promise<ActionError | { teams: number; placed: number; returned: number }> {
  const parsed = boardSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the draft." };
  }
  const { competitionId, teams } = parsed.data;

  // One person cannot be on two teams. The database would let it through —
  // placed_team_id is a single column, so the second write would silently win.
  const assigned = teams.flatMap((t) => t.playerIds);
  if (new Set(assigned).size !== assigned.length) {
    return { error: "Someone is on two teams — move them off one first." };
  }

  const supabase = await createClient();
  const { data: isAdmin, error: checkErr } = await supabase.rpc(
    "is_competition_admin",
    { _competition_id: competitionId },
  );
  if (checkErr) {
    console.error("[draft] permission check failed", checkErr.message);
    return { error: "That couldn't be saved. Please try again." };
  }
  if (isAdmin !== true) return { error: "Only an organizer can draft teams." };

  let placed = 0;
  for (const team of teams) {
    let teamId = team.id;

    if (!teamId) {
      if (team.playerIds.length === 0) continue; // nothing to create it for
      const { data: created, error } = await supabase
        .from("teams")
        .insert({
          competition_id: competitionId,
          name: team.name,
          status: "active",
        })
        .select("id")
        .single();
      if (error || !created) {
        console.error("[draft] team insert failed", error?.message);
        return { error: `Couldn't create ${team.name}. Please try again.` };
      }
      teamId = (created as { id: string }).id;
    } else if (team.name) {
      // A rename is part of the board too.
      await supabase.from("teams").update({ name: team.name }).eq("id", teamId);
    }

    if (team.playerIds.length > 0) {
      const { error } = await supabase.rpc("place_free_agents", {
        _team_id: teamId,
        _free_agent_ids: team.playerIds,
      });
      if (error) {
        console.error("[draft] place_free_agents failed", error.message);
        return { error: `Couldn't place players on ${team.name}.` };
      }
      placed += team.playerIds.length;
    }
  }

  // Anyone placed before and not on the board now goes back to the pool.
  const { data: stillPlaced } = await supabase
    .from("free_agents")
    .select("id")
    .eq("competition_id", competitionId)
    .eq("status", "placed");

  const keep = new Set(assigned);
  const orphaned = ((stillPlaced ?? []) as { id: string }[])
    .map((r) => r.id)
    .filter((id) => !keep.has(id));

  if (orphaned.length > 0) {
    const { error } = await supabase
      .from("free_agents")
      .update({ status: "available", placed_team_id: null })
      .in("id", orphaned);
    if (error) {
      console.error("[draft] return-to-pool failed", error.message);
      return { error: "Some players couldn't be returned to the pool." };
    }
  }

  revalidatePath("/orgs");
  return { teams: teams.length, placed, returned: orphaned.length };
}

const ranksSchema = z.object({
  competitionId: idSchema,
  ranks: z
    .array(
      z.object({
        playerId: idSchema,
        /** 1 = best in their position. Null clears the rank. */
        rank: z.number().int().min(1).max(999).nullable(),
      }),
    )
    .max(400),
});

export type DraftRanksInput = z.input<typeof ranksSchema>;

/**
 * Set players' strength ranks within their positions.
 *
 * Sent as a batch for the same reason the board is: the organizer is ordering a
 * list, and half an ordering is not a smaller ordering, it is a wrong one.
 *
 * Duplicates are allowed through deliberately. Typing a column of numbers goes
 * through states with two number 3s in it, and rejecting those would make an
 * ordinary edit impossible; `snakeDraft` breaks ties by list order, so a
 * duplicate is untidy rather than broken.
 */
export async function setDraftRanksAction(
  input: DraftRanksInput,
): Promise<ActionError | { updated: number }> {
  const parsed = ranksSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the ranks." };
  }
  const { competitionId, ranks } = parsed.data;

  const supabase = await createClient();
  const { data: isAdmin, error: checkErr } = await supabase.rpc(
    "is_competition_admin",
    { _competition_id: competitionId },
  );
  if (checkErr) {
    console.error("[draft] permission check failed", checkErr.message);
    return { error: "That couldn't be saved. Please try again." };
  }
  if (isAdmin !== true) return { error: "Only an organizer can rank players." };

  for (const { playerId, rank } of ranks) {
    const { error } = await supabase
      .from("free_agents")
      .update({ draft_rank: rank })
      .eq("id", playerId)
      // Scope the write to this competition so a stray id from the client
      // cannot reach another organizer's pool. RLS says the same thing.
      .eq("competition_id", competitionId);
    if (error) {
      console.error("[draft] rank update failed", error.message);
      return { error: "Those ranks couldn't be saved. Please try again." };
    }
  }

  revalidatePath("/orgs");
  return { updated: ranks.length };
}

/**
 * Empty every team for a re-draft, keeping the teams themselves.
 *
 * The format disbands teams every three weeks. Deleting them would take their
 * fixtures and results with them, so the rows stay and only the rosters clear —
 * the season's record is what makes the next draft informed.
 */
export async function clearDraftAction(
  competitionId: string,
): Promise<ActionError | { returned: number }> {
  if (!idSchema.safeParse(competitionId).success) {
    return { error: "Unknown competition." };
  }

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) return { error: "Only an organizer can do that." };

  const { data, error } = await supabase
    .from("free_agents")
    .update({ status: "available", placed_team_id: null })
    .eq("competition_id", competitionId)
    .eq("status", "placed")
    .select("id");

  if (error) {
    console.error("[draft] clear failed", error.message);
    return { error: "That couldn't be cleared. Please try again." };
  }

  revalidatePath("/orgs");
  return { returned: (data ?? []).length };
}
