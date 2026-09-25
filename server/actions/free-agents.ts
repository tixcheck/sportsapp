"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  isPaypalLink,
  normalisePaypalLink,
  MAX_PAYPAL_URL_LENGTH,
} from "@/lib/payments/paypal";

import { createClient } from "@/lib/supabase/server";
import { SKILL_LEVELS, sportConfig } from "@/lib/sports";
import { canDeleteSignup } from "@/lib/registration/signup-removal";
import { loadOrgPeople } from "@/lib/queries/org-people";
import { matchPeople, type OrgPerson } from "@/lib/registration/org-people";
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

  // The organizer's required player questions, enforced here as well as in the
  // form. Individuals were never asked them at all, so a league could mark
  // Gender required, collect it from every rostered player, and hold nothing
  // for the pool the teams are built from.
  //
  // Same rule and the same implementation the waiver gate uses (migration
  // 0104), rather than a second one that could disagree. It defaults to the
  // signed-in user, so this cannot be pointed at anybody else.
  //
  // Self-serve only: an organizer adding somebody from a spreadsheet goes
  // through `organizer_add_individual` (migration 0090), which this does not
  // touch — they cannot answer a question about a person on that person's
  // behalf, and a guest with no account cannot hold answers at all.
  const { data: owed } = await supabase.rpc("unanswered_player_questions", {
    _competition_id: v.competitionId,
  });
  if (typeof owed === "number" && owed > 0) {
    return {
      error:
        owed === 1
          ? "One of the organizer's questions still needs an answer."
          : `${owed} of the organizer's questions still need answers.`,
    };
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

const addPlayerSchema = z.object({
  competitionId: idSchema,
  name: z.string().trim().min(1, "Give them a name.").max(120),
  /** Optional since 0091: a name off a list often comes without one. */
  email: z.string().trim().toLowerCase().max(254).optional(),
  phone: z.string().trim().max(40).optional(),
  positions: z.array(z.string().trim().min(1)).max(8).default([]),
  skillLevel: z.enum(
    SKILL_LEVELS.map((l) => l.value) as [string, ...string[]],
    { message: "Pick the level that fits them best." },
  ),
  notes: z.string().trim().max(1000).optional(),
});

export type AddPlayerInput = z.input<typeof addPlayerSchema>;

/**
 * An organizer putting somebody into the individual pool by hand.
 *
 * `organizer_add_individual` has existed since migration 0090 and nothing has
 * ever called it — there was no way into the pool from the app except a player
 * signing themselves up. Mango's Friday league is drafted by its captains from
 * a list the organizer already holds, so the names have to go in before anyone
 * has registered.
 *
 * Positions are checked against the sport exactly as sign-up checks them. They
 * are not a nicety here: the draft board groups the pool into position columns,
 * and free text would put a player in a column of one that nobody is reading.
 *
 * The RPC carries the admin check itself (and `free_agents` has no INSERT
 * policy at all), so this adds none — it turns the refusal into a sentence.
 */
export async function addPlayerToPoolAction(
  input: AddPlayerInput,
): Promise<ActionError | { freeAgentId: string }> {
  const parsed = addPlayerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  const v = parsed.data;
  if (v.email && !z.string().email().safeParse(v.email).success) {
    return { error: "That email doesn't look right." };
  }

  const supabase = await createClient();
  const { data: comp } = await supabase
    .from("competitions")
    .select("sport")
    .eq("id", v.competitionId)
    .maybeSingle();
  if (!comp) return { error: "Unknown event." };

  const sport = (comp as { sport: Sport }).sport;
  const allowed = sportConfig(sport).positions;
  if (v.positions.some((position) => !allowed.includes(position))) {
    return { error: "That isn't a position for this sport." };
  }

  const { data, error } = await supabase.rpc("organizer_add_individual", {
    _competition_id: v.competitionId,
    _name: v.name,
    // Empty means no email. Passing "" would fail `free_agents_email_shape`;
    // migration 0129 makes the function itself null it out as well.
    _email: v.email ? v.email : null,
    _phone: v.phone ?? null,
    _positions: v.positions,
    _skill_level: v.skillLevel,
    _notes: v.notes ?? null,
  });

  if (error || typeof data !== "string") {
    const message = error?.message ?? "";
    if (message.includes("Only an organizer")) {
      return { error: "Only an organizer can add players." };
    }
    if (message.includes("needs a name")) {
      return { error: "A player needs a name." };
    }
    console.error("[free-agents] organizer_add_individual failed", message);
    return { error: "That player couldn't be added. Please try again." };
  }

  await revalidateForCompetition(supabase, v.competitionId);
  return { freeAgentId: data };
}

const searchPeopleSchema = z.object({
  competitionId: idSchema,
  query: z.string().trim().max(120),
});

/**
 * Find someone the organization already holds, to add to this league.
 *
 * Searched on the SERVER and returned a handful at a time rather than shipping
 * the org's whole address book to the browser — these rows carry real people's
 * email addresses.
 *
 * Scoped to this organization by RLS, not by a filter here: an organizer can
 * only read free agents and rostered accounts for competitions they administer.
 * There is deliberately no platform-wide lookup — being able to type an email
 * and learn whether it has an account is not something an organizer should be
 * able to do.
 */
export async function searchOrgPeopleAction(
  input: z.input<typeof searchPeopleSchema>,
): Promise<ActionError | { people: OrgPerson[] }> {
  const parsed = searchPeopleSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the search." };
  const { competitionId, query } = parsed.data;

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) return { error: "Only an organizer can do that." };

  if (query.trim() === "") return { people: [] };
  const people = await loadOrgPeople(competitionId);
  return { people: matchPeople(people, query) };
}

const addOrgPersonSchema = z.object({
  competitionId: idSchema,
  /** Which of the search results — an account, or a past sign-up row. */
  userId: idSchema.nullable().optional(),
  sourceFreeAgentId: idSchema.nullable().optional(),
});

/**
 * Add somebody the organization already knows to this league's pool.
 *
 * The client sends only an IDENTIFIER. Name, email, positions and grade are
 * re-read here from the org's own records, so a crafted request cannot invent a
 * person or attach an arbitrary email to one — and cannot reach an account the
 * caller does not administer, because `loadOrgPeople` is bounded by RLS.
 *
 * `organizer_add_individual` always writes `user_id = null`, which is right for
 * a name off a list. Here we know better: the account is set straight after, so
 * their appearances key to the account rather than to a spelling of their name.
 */
export async function addOrgPersonAction(
  input: z.input<typeof addOrgPersonSchema>,
): Promise<ActionError | { freeAgentId: string; name: string }> {
  const parsed = addOrgPersonSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the selection." };
  const { competitionId, userId, sourceFreeAgentId } = parsed.data;
  if (!userId && !sourceFreeAgentId) return { error: "Pick somebody first." };

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) return { error: "Only an organizer can add players." };

  const people = await loadOrgPeople(competitionId);
  const person = people.find((p) =>
    userId ? p.userId === userId : p.freeAgentId === sourceFreeAgentId,
  );
  if (!person) {
    return { error: "That player is already in this league, or wasn't found." };
  }

  const { data: comp } = await supabase
    .from("competitions")
    .select("sport")
    .eq("id", competitionId)
    .maybeSingle();
  const allowed = sportConfig(
    ((comp as { sport: Sport } | null)?.sport ?? "indoor6") as Sport,
  ).positions;

  const { data, error } = await supabase.rpc("organizer_add_individual", {
    _competition_id: competitionId,
    _name: person.name,
    _email: person.email,
    _phone: null,
    // Carried from wherever the org last recorded them; anything this sport
    // doesn't recognise is dropped rather than put into the board's columns.
    _positions: person.positions.filter((p) => allowed.includes(p)),
    _skill_level: person.skillLevel ?? "intermediate",
    _notes: null,
  });
  if (error || typeof data !== "string") {
    console.error("[free-agents] add org person failed", error?.message ?? "");
    return { error: "That player couldn't be added. Please try again." };
  }

  // Link the account when there is one. Best-effort: the sign-up exists either
  // way, and an unlinked row is what every organizer-added player already is.
  if (person.userId) {
    const { error: linkErr } = await supabase
      .from("free_agents")
      .update({ user_id: person.userId })
      .eq("id", data);
    if (linkErr) {
      console.error("[free-agents] account link failed", linkErr.message);
    }
  }

  await revalidateForCompetition(supabase, competitionId);
  return { freeAgentId: data, name: person.name };
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
  /**
   * The organizer's PayPal link for an INDIVIDUAL fee — a different amount
   * from the team link, and usually a different link in their dashboard.
   * Empty clears it, which falls the flow back to the team link.
   */
  /** How many individuals to take. Null clears the limit. */
  maxIndividualSignups: z
    .number()
    .int()
    .min(1, "A limit of zero would close sign-ups — untick the box instead.")
    .max(500)
    .nullable()
    .optional(),
  paypalIndividualUrl: z
    .string()
    .trim()
    .max(MAX_PAYPAL_URL_LENGTH)
    .refine((v) => v === "" || isPaypalLink(v), {
      message: "That isn't a PayPal payment link.",
    })
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
    .update({
      allow_individual_signups: v.allowIndividualSignups,
      // `undefined` leaves it alone; an explicit null clears the limit.
      ...(v.maxIndividualSignups === undefined
        ? {}
        : { max_individual_signups: v.maxIndividualSignups }),
    })
    .eq("id", v.competitionId);
  if (compError) {
    console.error("[free-agents] competition flag update failed");
    return { error: "That couldn't be saved. Please try again." };
  }

  if (
    v.individualFeeCents !== undefined ||
    v.paypalIndividualUrl !== undefined
  ) {
    const { error: feeError } = await supabase
      .from("competition_payment_settings")
      .upsert(
        {
          competition_id: v.competitionId,
          ...(v.individualFeeCents === undefined
            ? {}
            : { individual_fee_cents: v.individualFeeCents }),
          ...(v.paypalIndividualUrl === undefined
            ? {}
            : {
                paypal_individual_url: normalisePaypalLink(
                  v.paypalIndividualUrl,
                ),
              }),
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

const detailsSchema = z.object({
  freeAgentId: idSchema,
  name: z.string().trim().min(1, "Give them a name.").max(120),
  // Optional: an organizer-added sign-up may never have had one (0091).
  email: z.string().trim().toLowerCase().max(254).optional(),
  phone: z.string().trim().max(40).optional(),
  positions: z.array(z.string().trim().min(1)).max(8).default([]),
  skillLevel: z.enum(
    SKILL_LEVELS.map((l) => l.value) as [string, ...string[]],
    { message: "Pick a level." },
  ),
  notes: z.string().trim().max(1000).optional(),
});

export type FreeAgentDetailsInput = z.input<typeof detailsSchema>;

/**
 * An organizer correcting an individual sign-up's details.
 *
 * Asked for directly: "where are the individual registrants sitting ... in case
 * I want to edit any information." Nothing could change these fields after
 * sign-up — a misspelt name or a wrong phone number stayed wrong.
 *
 * `free_agents_admin_write` already limits updates to the competition's
 * organizers; checking here turns a silent no-op into a sentence. Positions are
 * checked against the sport exactly as sign-up checks them, so an edit cannot
 * put free text into the list the draft board groups players by.
 *
 * Details only. Status and placement stay with the draft board and the
 * Remove/Restore buttons, which carry the rules for moving people between
 * teams — an edit form that could also re-place somebody would bypass them.
 */
export async function updateFreeAgentDetailsAction(
  input: FreeAgentDetailsInput,
): Promise<ActionError | { ok: true }> {
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  const v = parsed.data;
  if (v.email && !z.string().email().safeParse(v.email).success) {
    return { error: "That email doesn't look right." };
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("free_agents")
    .select("competition_id, name, user_id")
    .eq("id", v.freeAgentId)
    .maybeSingle();
  if (!row) return { error: "Unknown sign-up." };
  const existing = row as {
    competition_id: string;
    name: string;
    user_id: string | null;
  };
  const competitionId = existing.competition_id;

  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only an organizer can edit a sign-up." };
  }

  const { data: comp } = await supabase
    .from("competitions")
    .select("sport")
    .eq("id", competitionId)
    .maybeSingle();
  const sport = ((comp as { sport: Sport } | null)?.sport ??
    "indoor6") as Sport;
  const allowed = sportConfig(sport).positions;
  if (v.positions.some((position) => !allowed.includes(position))) {
    return { error: "That isn't a position for this sport." };
  }

  const { error } = await supabase
    .from("free_agents")
    .update({
      name: v.name,
      email: v.email ? v.email : null,
      phone: v.phone ? v.phone : null,
      positions: v.positions,
      skill_level: v.skillLevel,
      notes: v.notes ? v.notes : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", v.freeAgentId);

  if (error) {
    console.error("[free-agents] details update failed");
    return { error: "Those details couldn't be saved. Please try again." };
  }

  await renameInLineups(supabase, competitionId, existing, v.name);
  await revalidateForCompetition(supabase, competitionId);
  return { ok: true };
}

/**
 * Carry a corrected name through to the nights already recorded.
 *
 * Big Shoots' organizer fixed a misspelling here and got a second player: the
 * roster said "David Aitken" while three recorded absences still said "David
 * Aitkin", and a player with no account IS their name — `identityKey` is
 * `n:<normalised name>` — so the stats table showed two people, one with the
 * games and one with the missed night.
 *
 * Only for name-keyed players. Someone with an account is keyed on the id and
 * their display name comes from `users`, so rewriting typed names would be
 * both pointless and wrong.
 *
 * Best-effort, like `recordAbsences`: the detail edit itself has already saved,
 * and failing it here would tell the organizer their correction was lost when
 * it wasn't. The rows can be renamed again.
 */
async function renameInLineups(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitionId: string,
  existing: { name: string; user_id: string | null },
  nextName: string,
): Promise<void> {
  if (existing.user_id !== null) return;
  const from = existing.name?.trim() ?? "";
  const to = nextName.trim();
  if (!from || from === to) return;

  for (const table of ["match_appearances", "match_absences"] as const) {
    const { error } = await supabase
      .from(table)
      .update({ player_name: to })
      .eq("competition_id", competitionId)
      .eq("player_name", from)
      .is("user_id", null);
    if (error) {
      console.error(`[free-agents] rename in ${table} failed`, error.message);
    }
  }
}

/**
 * Delete an individual sign-up for good.
 *
 * Brampton's organizer on a cancelled test entry: "I'd prefer they were removed
 * completely if their registration was cancelled." Withdrawing only greys the
 * row, and it stays in the pool the organizer reads every week.
 *
 * Refused once money the PLATFORM handled has moved — see `canDeleteSignup`.
 * The payment rows CASCADE off this one, so deleting a card-paid sign-up would
 * take the ledger entry, the fee owed on it and Stripe's refund with it. Money
 * taken off-platform is the organizer's own record and goes when they say so.
 *
 * The roster row goes too, the same as withdrawing: leaving it behind would
 * keep a deleted person on a team sheet.
 */
export async function removeFreeAgentAction(input: {
  freeAgentId: string;
}): Promise<ActionError | { deleted: true }> {
  if (!idSchema.safeParse(input.freeAgentId).success) {
    return { error: "Unknown sign-up." };
  }
  const freeAgentId = input.freeAgentId;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("free_agents")
    .select("competition_id, user_id, placed_team_id")
    .eq("id", freeAgentId)
    .maybeSingle();
  if (!row) return { error: "Unknown sign-up." };
  const fa = row as {
    competition_id: string;
    user_id: string | null;
    placed_team_id: string | null;
  };

  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: fa.competition_id,
  });
  if (isAdmin !== true) {
    return { error: "Only an organizer can remove a sign-up." };
  }

  // The fee columns decide it, not just the status: an off-platform payment we
  // were owed nothing on is the organizer's own record to discard, while a card
  // charge is Stripe's. See `canDeleteSignup`.
  const { data: payments } = await supabase
    .from("registration_payments")
    .select("status, method, application_fee_cents, platform_fee_settled_at")
    .eq("free_agent_id", freeAgentId);
  const check = canDeleteSignup(
    (
      (payments ?? []) as {
        status: string;
        method: string | null;
        application_fee_cents: number;
        platform_fee_settled_at: string | null;
      }[]
    ).map((p) => ({
      status: p.status,
      method: p.method,
      applicationFeeCents: p.application_fee_cents,
      platformFeeSettledAt: p.platform_fee_settled_at,
    })),
  );
  if (!check.canDelete) return { error: check.reason };

  if (fa.user_id && fa.placed_team_id) {
    await supabase
      .from("team_members")
      .delete()
      .eq("team_id", fa.placed_team_id)
      .eq("user_id", fa.user_id)
      // Never strip a captain off their own team as a side effect.
      .neq("role", "captain");
  }

  // Snapshot and delete in one call (migration 0127). Doing it from here would
  // be two statements: a record of a removal that did not happen, or — worse,
  // because nobody would ever notice — a deletion with no record.
  const { error } = await supabase.rpc("remove_free_agent", {
    _free_agent_id: freeAgentId,
  });
  if (error) {
    console.error("[free-agents] delete failed", error.message);
    return { error: "That couldn't be removed. Please try again." };
  }

  await revalidateForCompetition(supabase, fa.competition_id);
  return { deleted: true };
}

const noteSchema = z.object({
  removedSignupId: idSchema,
  /** Empty clears it — an organizer should be able to take a note back. */
  note: z.string().trim().max(2000, "That note is too long.").default(""),
});

/**
 * The organizer's note on a removed sign-up.
 *
 * Editable rather than written once: the reason someone left, and whether they
 * were refunded, is usually known after the removal rather than during it.
 *
 * Authorization is the table's UPDATE policy (`is_org_admin`), which is why
 * there is no admin check here — the update simply matches no row for anyone
 * else. The snapshot columns are never touched; only the note.
 */
export async function updateRemovedSignupNoteAction(
  input: z.input<typeof noteSchema>,
): Promise<ActionError | { ok: true }> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the note." };
  }
  const { removedSignupId, note } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("removed_signups")
    .update({
      note: note === "" ? null : note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", removedSignupId)
    .select("competition_id")
    .maybeSingle();
  if (error) {
    console.error("[free-agents] note update failed", error.message);
    return { error: "That couldn't be saved. Please try again." };
  }
  if (!data) return { error: "Only an organizer can edit that note." };

  await revalidateForCompetition(
    supabase,
    (data as { competition_id: string }).competition_id,
  );
  return { ok: true };
}
