"use server";

import { revalidatePath } from "next/cache";

import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";
import {
  assignBracketTimes,
  bracketMatchCourt,
  bracketSlotKey,
  dualBracketMatches,
  nextPowerOfTwo,
} from "@/lib/scheduler/bracket";
import { estimateMatchMinutes } from "@/lib/formats";
import { teamsMissingDrops } from "@/lib/standings/drops";
import { generateReseedBracket } from "@/lib/bracket/reseed";
import type { MatchFormat } from "@/lib/db/schema";

type ActionError = { error: string };

/** Seed lists per track. Omitting `consolation` ⇒ a single (untagged) bracket. */
export interface BracketSeeds {
  championship: string[];
  consolation?: string[];
}

/** The courts each track's matches are spread across (round-robin per round). */
export interface BracketCourts {
  championship: number[];
  consolation: number[];
}

const DEFAULT_COURTS: BracketCourts = {
  championship: [1, 2, 3],
  consolation: [1, 2, 3],
};

function validCourts(list: number[] | undefined): boolean {
  return (
    !!list &&
    list.length > 0 &&
    list.every((n) => Number.isInteger(n) && n >= 1 && n <= 99)
  );
}

/**
 * Generate (or regenerate) the bracket(s) from explicit seed orders. The
 * organizer's panel computes the default seeding via selectAdvancers and may
 * reorder it (coin-flip ties), so each track's order is passed in verbatim.
 * One list ⇒ a single-elim bracket (track null, unchanged behaviour); two lists
 * ⇒ independent Championship + Consolation trees. Byes are resolved into round 2
 * by seededBracketMatches; bracket matches carry no pool_id, so they use the
 * competition's standard format. Regenerating discards every existing bracket.
 */
export async function generateBracketAction(
  competitionId: string,
  seeds: BracketSeeds,
  courts: BracketCourts = DEFAULT_COURTS,
  /**
   * An explicit format for the bracket matches (e.g. best-of-3 playoffs off a
   * single-set league season). When omitted, bracket matches carry no format and
   * resolve to the competition's format, as before.
   */
  bracketFormatOverride?: MatchFormat | null,
  /**
   * Re-seeding bracket: each round re-ranks survivors by seed and pairs highest
   * vs lowest, built round-by-round. Only for a single bracket (not dual).
   */
  reseed = false,
): Promise<ActionError | { matchCount: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can generate the bracket." };
  }

  // Hard drop-gate (defense in depth behind the UI block): a flagged pool must
  // have every team's dropped game chosen before any bracket is generated.
  const { data: dropPools } = await supabase
    .from("pools")
    .select("id")
    .eq("competition_id", competitionId)
    .eq("needs_drop", true);
  if (dropPools && dropPools.length) {
    const { data: dropTeams } = await supabase
      .from("teams")
      .select("id, dropped_match_id")
      .in(
        "pool_id",
        dropPools.map((p) => p.id),
      );
    const missing = teamsMissingDrops(
      (dropTeams ?? []).map((t) => ({
        teamId: t.id,
        poolNeedsDrop: true,
        droppedMatchId: t.dropped_match_id,
      })),
    );
    if (missing.length) {
      return {
        error:
          "Set every team's dropped game in the flagged pools before generating the bracket.",
      };
    }
  }

  if (!validCourts(courts.championship) || !validCourts(courts.consolation)) {
    return { error: "Enter valid court numbers for the bracket." };
  }

  const championship = seeds.championship ?? [];
  const consolation = seeds.consolation ?? [];
  if (championship.length < 2) {
    return { error: "At least 2 teams must advance to make a bracket." };
  }
  if (consolation.length === 1) {
    return { error: "A consolation bracket needs at least 2 teams." };
  }
  const all = [...championship, ...consolation];
  if (new Set(all).size !== all.length) {
    return { error: "A team can't appear in more than one bracket slot." };
  }
  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("competition_id", competitionId)
    .in("id", all);
  const valid = new Set((teams ?? []).map((t) => t.id));
  if (all.some((id) => !valid.has(id))) {
    return { error: "Some advancing teams aren't in this competition." };
  }

  const matches = dualBracketMatches({
    championship,
    consolation: consolation.length ? consolation : undefined,
  });
  if (matches.length === 0) return { error: "Not enough teams for a bracket." };

  const { error: del } = await supabase
    .from("matches")
    .delete()
    .eq("competition_id", competitionId)
    .not("bracket_position", "is", null);
  if (del) return { error: del.message };

  // Estimated start: bracket play chains off the last pool match's end, else the
  // tournament start date at 09:00; null if neither is known (→ "Time TBD").
  const [{ data: comp }, { data: settings }, { data: lastPool }] =
    await Promise.all([
      supabase
        .from("competitions")
        .select("start_date, timezone, match_format")
        .eq("id", competitionId)
        .single(),
      supabase
        .from("tournament_settings")
        .select("pool_format")
        .eq("competition_id", competitionId)
        .maybeSingle(),
      supabase
        .from("matches")
        .select("scheduled_at")
        .eq("competition_id", competitionId)
        .is("bracket_position", null) // last pool / regular-season match
        .not("scheduled_at", "is", null)
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const tz = comp?.timezone ?? "America/Toronto";
  // Pool-play slot (to chain the bracket after pool play) and bracket-match slot
  // are each derived from their own format.
  // The bracket's own format (an override, e.g. best-of-3 playoffs) or the
  // competition default. Drives both the time estimate and the per-match stamp.
  const bracketFormat =
    bracketFormatOverride ?? (comp?.match_format as MatchFormat);
  const poolFormat =
    (settings?.pool_format as MatchFormat | null) ??
    (comp?.match_format as MatchFormat);
  const poolSlot = estimateMatchMinutes(poolFormat);
  const bracketSlotMin = estimateMatchMinutes(bracketFormat);
  let startDt: DateTime | null = null;
  if (lastPool?.scheduled_at) {
    startDt = DateTime.fromISO(lastPool.scheduled_at, { zone: tz }).plus({
      minutes: poolSlot,
    });
  } else if (comp?.start_date) {
    startDt = DateTime.fromISO(`${comp.start_date}T09:00`, { zone: tz });
  }
  // Round the start up to a clean 15-minute boundary.
  const QUARTER = 15 * 60_000;
  const startMs =
    startDt && startDt.isValid
      ? Math.ceil(startDt.toMillis() / QUARTER) * QUARTER
      : null;

  // Re-seeding bracket (single only): persist the seed order + create round 1;
  // later rounds are built as each round finishes (advanceReseedBracket).
  if (reseed) {
    const res = await generateReseedBracket(
      supabase,
      {
        competitionId,
        courts: courts.championship,
        bracketFormat: bracketFormatOverride ?? null,
        startMs,
        slotMinutes: bracketSlotMin,
      },
      championship,
    );
    if ("error" in res) return res;
    return { matchCount: res.matchCount };
  }
  // Fixed tree: make sure any prior re-seed marker is cleared.
  await supabase
    .from("competitions")
    .update({ bracket_reseed_seeds: null })
    .eq("id", competitionId);

  // Stamp each match's court by the top/bottom-half rule, per track (a single
  // bracket uses the championship pair; the final's court is left blank), and an
  // estimated time (sequential per court, respecting round dependencies).
  const champSize = nextPowerOfTwo(championship.length);
  const consoSize = nextPowerOfTwo(consolation.length);
  const courtFor = (m: (typeof matches)[number]) => {
    const conso = m.track === "consolation";
    return bracketMatchCourt(
      m.round,
      m.position,
      conso ? consoSize : champSize,
      conso ? courts.consolation : courts.championship,
    );
  };
  const times =
    startMs == null
      ? null
      : assignBracketTimes(
          matches.map((m) => ({
            round: m.round,
            position: m.position,
            track: m.track,
            court: courtFor(m),
          })),
          startMs,
          bracketSlotMin * 60_000,
        );

  const rows = matches.map((m) => {
    const courtNo = courtFor(m);
    const slotMs = times?.get(bracketSlotKey(m.track, m.round, m.position));
    return {
      competition_id: competitionId,
      round: m.round,
      bracket_position: m.position,
      bracket_track: m.track,
      home_team_id: m.homeTeamId,
      away_team_id: m.awayTeamId,
      status: "scheduled" as const,
      court: courtNo == null ? null : `Court ${courtNo}`,
      scheduled_at: slotMs != null ? new Date(slotMs).toISOString() : null,
      // Only stamp a per-match format when overriding; otherwise leave null so it
      // resolves to the competition format (unchanged behavior).
      match_format: bracketFormatOverride ?? null,
    };
  });
  const { error: ins } = await supabase.from("matches").insert(rows);
  if (ins) return { error: ins.message };

  revalidatePath("/orgs");
  return { matchCount: rows.length };
}
