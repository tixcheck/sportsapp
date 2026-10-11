"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { seatTiers } from "@/lib/scheduler/alignment";

type ActionError = { error: string };

const seatSchema = z.object({
  competitionId: z.string().uuid(),
  sizes: z.array(z.number().int().min(2).max(20)).min(1).max(12),
});

/**
 * Seat Round 1 from the alignment night's ranking (0165): tiers top down in
 * the sizes given, each team's seed its overall rank. Reuses the league's
 * tiers in order and adds "Division X" for any missing. Only before the
 * ladder has placed anyone — after that, tiers move by the ladder's own rule.
 */
export async function seatAlignmentTiersAction(
  values: z.infer<typeof seatSchema>,
): Promise<ActionError | { success: true; tiers: number }> {
  const parsed = seatSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the tiers." };
  }
  const { competitionId, sizes } = parsed.data;
  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (!isAdmin) return { error: "Only an organizer can seat the tiers." };

  const [{ data: ranking }, { count: placed }, { data: existing }] =
    await Promise.all([
      supabase.rpc("alignment_ranking", { _competition_id: competitionId }),
      supabase
        .from("ladder_placements")
        .select("id", { count: "exact", head: true })
        .eq("competition_id", competitionId),
      supabase
        .from("divisions")
        .select("id, name, tier_order")
        .eq("competition_id", competitionId)
        .order("tier_order", { ascending: true }),
    ]);
  const ranked = ((ranking ?? []) as { team_id: string }[]).map(
    (r) => r.team_id,
  );
  if (ranked.length === 0) {
    return { error: "The alignment night isn't finished yet." };
  }
  if ((placed ?? 0) > 0) {
    return {
      error:
        "Round 1 is already drawn. Tiers move by the ladder now, not the alignment night.",
    };
  }
  const seated = seatTiers(ranked, sizes);
  if ("error" in seated) return seated;

  const divisionIds: string[] = (existing ?? []).map((d) => d.id as string);
  if (divisionIds.length > sizes.length) {
    return {
      error: `This league has ${divisionIds.length} tiers. Seat it into ${divisionIds.length}, or remove the extra tiers first.`,
    };
  }
  for (let i = divisionIds.length; i < sizes.length; i++) {
    const { data: d, error } = await supabase
      .from("divisions")
      .insert({
        competition_id: competitionId,
        name: `Division ${String.fromCharCode(65 + i)}`,
        tier_order: i,
      })
      .select("id")
      .single();
    if (error || !d) return { error: error?.message ?? "Couldn't add a tier." };
    divisionIds.push(d.id as string);
  }

  for (const [t, teamIds] of seated.tiers.entries()) {
    for (const teamId of teamIds) {
      const { error } = await supabase
        .from("teams")
        .update({
          division_id: divisionIds[t],
          seed: seated.seeds.get(teamId),
        })
        .eq("id", teamId)
        .eq("competition_id", competitionId);
      if (error) return { error: error.message };
    }
  }

  revalidatePath("/orgs");
  return { success: true, tiers: sizes.length };
}
