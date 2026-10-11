import { createClient } from "@/lib/supabase/server";
import { LETTERS } from "@/lib/scheduler/alignment";

/**
 * A league's alignment night (0165): each session's seats, how many of its
 * games are in, its live standings, and — once every session is done — the
 * night's 1–N ranking. Everything is read through RLS and the gated rpcs, so
 * this returns null for anyone the schedule isn't shown to.
 */
export interface AlignmentRow {
  teamId: string;
  name: string;
  wins: number;
  plusMinus: number;
}

export interface AlignmentSession {
  id: string;
  seq: number;
  venueName: string | null;
  startsAt: string;
  /** Seat letter → team name; null = waiting on the session it climbs from. */
  seats: { letter: string; name: string | null }[];
  climbFromStartsAt: string | null;
  played: number;
  games: number;
  standings: AlignmentRow[];
  complete: boolean;
  /** Overall rank per finishing place; null = moves on. */
  placeRanks: (number | null)[];
}

export interface AlignmentNight {
  sessions: AlignmentSession[];
  /** Empty until every session is complete. */
  ranking: { rank: number; teamId: string; name: string }[];
  /** Teams already placed in a tier for this league. */
  seated: number;
}

export async function getAlignmentNight(
  competitionId: string,
): Promise<AlignmentNight | null> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("alignment_sessions")
    .select(
      "id, seq, starts_at, seeds, climb_from, place_ranks, completed_at, venue:venues(name)",
    )
    .eq("competition_id", competitionId)
    .order("starts_at", { ascending: true });
  if (!rows || rows.length === 0) return null;

  const [{ data: teams }, { data: matches }, { data: ranking }] =
    await Promise.all([
      supabase
        .from("teams")
        .select("id, name, division_id")
        .eq("competition_id", competitionId),
      supabase
        .from("matches")
        .select("alignment_session_id, status")
        .eq("competition_id", competitionId)
        .not("alignment_session_id", "is", null),
      supabase.rpc("alignment_ranking", { _competition_id: competitionId }),
    ]);
  const nameOf = new Map(
    (teams ?? []).map((t) => [t.id as string, t.name as string]),
  );
  const startOf = new Map(
    rows.map((r) => [r.id as string, r.starts_at as string]),
  );

  const standings = await Promise.all(
    rows.map((r) =>
      supabase.rpc("alignment_session_standings", { _session: r.id }),
    ),
  );

  const sessions: AlignmentSession[] = rows.map((r, i) => {
    const ms = (matches ?? []).filter((m) => m.alignment_session_id === r.id);
    const venue = r.venue as unknown as { name: string } | null;
    return {
      id: r.id as string,
      seq: r.seq as number,
      venueName: venue?.name ?? null,
      startsAt: r.starts_at as string,
      seats: (r.seeds as (string | null)[]).map((id, s) => ({
        letter: LETTERS[s],
        name: id ? (nameOf.get(id) ?? "—") : null,
      })),
      climbFromStartsAt: r.climb_from
        ? (startOf.get(r.climb_from as string) ?? null)
        : null,
      played: ms.filter((m) => m.status === "completed").length,
      games: ms.length,
      standings: (
        (standings[i].data ?? []) as {
          team_id: string;
          wins: number;
          plus_minus: number;
        }[]
      ).map((s) => ({
        teamId: s.team_id,
        name: nameOf.get(s.team_id) ?? "—",
        wins: s.wins,
        plusMinus: s.plus_minus,
      })),
      complete: r.completed_at != null,
      placeRanks: r.place_ranks as (number | null)[],
    };
  });

  return {
    sessions,
    ranking: ((ranking ?? []) as { rank: number; team_id: string }[]).map(
      (x) => ({
        rank: x.rank,
        teamId: x.team_id,
        name: nameOf.get(x.team_id) ?? "—",
      }),
    ),
    seated: (teams ?? []).filter((t) => t.division_id != null).length,
  };
}
