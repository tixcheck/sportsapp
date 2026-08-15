"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { SKILL_LEVELS, sportConfig } from "@/lib/sports";
import type { Sport } from "@/lib/formats";

type ActionError = { error: string };

const idSchema = z.string().uuid();

const signupSchema = z.object({
  competitionId: idSchema,
  name: z.string().trim().min(1, "Tell us your name.").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("That email doesn't look right."),
  phone: z.string().trim().max(40).optional(),
  // Bounded to match the DB check; the sport-specific values are checked below,
  // once we know which sport this competition is.
  positions: z.array(z.string().trim().min(1)).max(8).default([]),
  skillLevel: z.enum(
    SKILL_LEVELS.map((l) => l.value) as [string, ...string[]],
    { message: "Pick the level that fits you best." },
  ),
  notes: z.string().trim().max(1000).optional(),
});

export type IndividualSignupInput = z.input<typeof signupSchema>;

/**
 * Sign up as an individual — a player with no team, for the organizer to place.
 *
 * The open/closed rule and the insert both live in `register_individual`
 * (migration 0076) rather than here: checking "is registration open" in the
 * action and inserting afterwards leaves a window where a closing event still
 * takes sign-ups. This validates shape, then lets the database decide.
 */
export async function registerIndividualAction(
  input: IndividualSignupInput,
): Promise<ActionError | { freeAgentId: string; feeCents: number }> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const v = parsed.data;

  const supabase = await createClient();

  // Positions are sport-specific, so they can only be validated once we know
  // the sport. Anything not on that sport's list is rejected rather than
  // stored — the organizer's list must not fill up with free-text.
  const { data: comp } = await supabase
    .from("competitions")
    .select("id, slug, type, sport")
    .eq("id", v.competitionId)
    .maybeSingle();
  if (!comp) return { error: "Unknown event." };
  const c = comp as { id: string; slug: string; type: string; sport: Sport };

  const allowed = sportConfig(c.sport).positions;
  const positions = v.positions.filter((p) => allowed.includes(p));
  if (positions.length !== v.positions.length) {
    return { error: "That isn't a position for this sport." };
  }

  const { data, error } = await supabase.rpc("register_individual", {
    _competition_id: v.competitionId,
    _name: v.name,
    _email: v.email,
    _phone: v.phone ?? null,
    _positions: positions,
    _skill_level: v.skillLevel,
    _notes: v.notes ?? null,
  });

  if (error || typeof data !== "string") {
    // The function raises readable messages for the cases a player can hit
    // (closed, not taking individuals); anything else is ours to hide.
    const message = error?.message ?? "";
    if (
      message.includes("not taking individual") ||
      message.includes("Registration is closed") ||
      message.includes("signed in")
    ) {
      return { error: message };
    }
    console.error("[free-agents] register_individual failed");
    return { error: "That couldn't be saved. Please try again." };
  }

  const { data: settings } = await supabase
    .from("competition_payment_settings")
    .select("individual_fee_cents")
    .eq("competition_id", v.competitionId)
    .maybeSingle();

  revalidatePath(`/register/${c.slug}`);
  revalidatePath(`/${c.type === "league" ? "l" : "t"}/${c.slug}`);

  return {
    freeAgentId: data,
    feeCents:
      (settings as { individual_fee_cents: number } | null)
        ?.individual_fee_cents ?? 0,
  };
}

const placeSchema = z.object({
  teamId: idSchema,
  freeAgentIds: z.array(idSchema).min(1, "Pick at least one player."),
});

/**
 * Put free agents onto an existing team.
 *
 * The roster write and the status change happen together in
 * `place_free_agents`, which also MOVES anyone already on another team rather
 * than leaving them on two.
 */
export async function placeFreeAgentsAction(
  input: z.input<typeof placeSchema>,
): Promise<ActionError | { placed: number }> {
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the selection." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_free_agents", {
    _team_id: parsed.data.teamId,
    _free_agent_ids: parsed.data.freeAgentIds,
  });

  if (error) {
    if (error.message.includes("Only an organizer")) {
      return { error: "Only an organizer can place players." };
    }
    console.error("[free-agents] place_free_agents failed");
    return { error: "Those players couldn't be placed. Please try again." };
  }

  await revalidateForTeam(supabase, parsed.data.teamId);
  return { placed: typeof data === "number" ? data : 0 };
}

const formTeamSchema = z.object({
  competitionId: idSchema,
  teamName: z.string().trim().min(1, "Give the team a name.").max(80),
  divisionId: idSchema.nullable().optional(),
  freeAgentIds: z.array(idSchema).min(1, "Pick at least one player."),
});

/**
 * Build a brand-new team out of selected free agents.
 *
 * This is the moment a free agent becomes an entrant: until now they were a
 * person in a list, and creating the `teams` row is what puts them into
 * schedules and standings. The team is created 'active' — the organizer chose
 * to form it, so it is not waiting on anyone's payment.
 */
export async function createTeamFromFreeAgentsAction(
  input: z.input<typeof formTeamSchema>,
): Promise<ActionError | { teamId: string; placed: number }> {
  const parsed = formTeamSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: v.competitionId,
  });
  if (isAdmin !== true) return { error: "Only an organizer can do that." };

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .insert({
      competition_id: v.competitionId,
      name: v.teamName,
      division_id: v.divisionId ?? null,
      status: "active",
    })
    .select("id")
    .single();

  if (teamError || !team) {
    console.error("[free-agents] team insert failed");
    return { error: "That team couldn't be created. Please try again." };
  }

  const teamId = (team as { id: string }).id;
  const placed = await placeFreeAgentsAction({
    teamId,
    freeAgentIds: v.freeAgentIds,
  });
  if ("error" in placed) return placed;

  return { teamId, placed: placed.placed };
}

const statusSchema = z.object({
  freeAgentId: idSchema,
  status: z.enum(["available", "withdrawn"]),
});

/**
 * Return someone to the pool, or take them out of it.
 *
 * Withdrawing keeps the row rather than deleting it — a paid sign-up needs
 * something for a refund to point at, and the organizer needs to remember who
 * pulled out. `placed_team_id` is cleared either way, because both states mean
 * "not on a team"; the DB check would refuse the row otherwise.
 */
export async function setFreeAgentStatusAction(
  input: z.input<typeof statusSchema>,
): Promise<ActionError | { ok: true }> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the selection." };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("free_agents")
    .select("competition_id, placed_team_id")
    .eq("id", parsed.data.freeAgentId)
    .maybeSingle();
  if (!row) return { error: "Unknown sign-up." };
  const r = row as { competition_id: string; placed_team_id: string | null };

  // The roster row goes with them: leaving it behind means a withdrawn player
  // still counts on a team sheet.
  if (r.placed_team_id) {
    const { data: fa } = await supabase
      .from("free_agents")
      .select("user_id")
      .eq("id", parsed.data.freeAgentId)
      .maybeSingle();
    const userId = (fa as { user_id: string | null } | null)?.user_id;
    if (userId) {
      await supabase
        .from("team_members")
        .delete()
        .eq("team_id", r.placed_team_id)
        .eq("user_id", userId);
    }
  }

  const { error } = await supabase
    .from("free_agents")
    .update({
      status: parsed.data.status,
      placed_team_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.freeAgentId);

  if (error) {
    console.error("[free-agents] status update failed");
    return { error: "That couldn't be saved. Please try again." };
  }

  await revalidateForCompetition(supabase, r.competition_id);
  return { ok: true };
}

const settingsSchema = z.object({
  competitionId: idSchema,
  allowIndividualSignups: z.boolean(),
  /** Whole dollars in the form; cents in the database. */
  individualFeeCents: z
    .number()
    .int("Use a whole number.")
    .min(0, "A fee can't be negative.")
    .max(100_000_00, "That fee looks too high.")
    .optional(),
});

/**
 * The organizer's switch: does this event take individuals, and at what price.
 *
 * The flag lives on `competitions` and the price on
 * `competition_payment_settings`, so this writes both. The settings row is
 * created lazily elsewhere, so this upserts rather than assuming one exists.
 */
export async function updateIndividualSignupSettingsAction(
  input: z.input<typeof settingsSchema>,
): Promise<ActionError | { ok: true }> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: v.competitionId,
  });
  if (isAdmin !== true) return { error: "Only an organizer can do that." };

  const { error: compError } = await supabase
    .from("competitions")
    .update({ allow_individual_signups: v.allowIndividualSignups })
    .eq("id", v.competitionId);
  if (compError) {
    console.error("[free-agents] competition flag update failed");
    return { error: "That couldn't be saved. Please try again." };
  }

  if (v.individualFeeCents !== undefined) {
    const { error: feeError } = await supabase
      .from("competition_payment_settings")
      .upsert(
        {
          competition_id: v.competitionId,
          individual_fee_cents: v.individualFeeCents,
        },
        { onConflict: "competition_id" },
      );
    if (feeError) {
      console.error("[free-agents] individual fee update failed");
      return { error: "The fee couldn't be saved. Please try again." };
    }
  }

  await revalidateForCompetition(supabase, v.competitionId);
  return { ok: true };
}

// --- revalidation helpers ---------------------------------------------------

type Client = Awaited<ReturnType<typeof createClient>>;

async function revalidateForCompetition(
  supabase: Client,
  competitionId: string,
) {
  const { data } = await supabase
    .from("competitions")
    .select("slug, type, org_id")
    .eq("id", competitionId)
    .maybeSingle();
  const c = data as { slug: string; type: string; org_id: string } | null;
  if (!c) return;
  const base = c.type === "league" ? "leagues" : "tournaments";
  revalidatePath(`/orgs/${c.org_id}/${base}/${competitionId}`);
  revalidatePath(`/register/${c.slug}`);
  revalidatePath(`/${c.type === "league" ? "l" : "t"}/${c.slug}`);
}

async function revalidateForTeam(supabase: Client, teamId: string) {
  const { data } = await supabase
    .from("teams")
    .select("competition_id")
    .eq("id", teamId)
    .maybeSingle();
  const t = data as { competition_id: string } | null;
  revalidatePath(`/teams/${teamId}`);
  if (t) await revalidateForCompetition(supabase, t.competition_id);
}
