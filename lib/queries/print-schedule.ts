import { createClient } from "@/lib/supabase/server";

export interface PrintMatch {
  round: number | null;
  scheduledAt: string | null;
  court: string | null;
  homeName: string;
  awayName: string;
  refName: string | null;
  poolName: string | null;
  divisionName: string | null;
  bracketPosition: number | null;
}

export interface PrintSchedule {
  name: string;
  type: string;
  venue: string | null;
  timezone: string;
  matches: PrintMatch[];
}

/**
 * A competition's full schedule, flattened for a printable page: every match
 * with its teams, court, time, ref, and (for tournaments) pool/division. Reads
 * through RLS, so it returns data only for schedules the caller may see.
 */
export async function getPrintSchedule(
  competitionId: string,
): Promise<PrintSchedule | null> {
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from("competitions")
    .select("name, type, venue, timezone")
    .eq("id", competitionId)
    .single();
  if (!comp) return null;

  const { data: rows } = await supabase
    .from("matches")
    .select(
      "round, scheduled_at, court, home_team_id, away_team_id, ref_team_id, pool_id, bracket_position",
    )
    .eq("competition_id", competitionId);
  const matchRows = rows ?? [];

  const teamIds = [
    ...new Set(
      matchRows
        .flatMap((m) => [m.home_team_id, m.away_team_id, m.ref_team_id])
        .filter(Boolean) as string[],
    ),
  ];
  const poolIds = [
    ...new Set(matchRows.map((m) => m.pool_id).filter(Boolean) as string[]),
  ];

  const [{ data: teams }, { data: pools }, { data: divisions }] =
    await Promise.all([
      teamIds.length
        ? supabase.from("teams").select("id, name").in("id", teamIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      poolIds.length
        ? supabase
            .from("pools")
            .select("id, name, division_id")
            .in("id", poolIds)
        : Promise.resolve({
            data: [] as {
              id: string;
              name: string;
              division_id: string | null;
            }[],
          }),
      supabase
        .from("divisions")
        .select("id, name")
        .eq("competition_id", competitionId),
    ]);

  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const divName = new Map((divisions ?? []).map((d) => [d.id, d.name]));
  const poolInfo = new Map(
    (pools ?? []).map((p) => [
      p.id,
      { name: p.name as string, divisionId: p.division_id as string | null },
    ]),
  );

  const matches: PrintMatch[] = matchRows.map((m) => {
    const pool = m.pool_id ? poolInfo.get(m.pool_id) : null;
    return {
      round: m.round,
      scheduledAt: m.scheduled_at,
      court: m.court,
      homeName: m.home_team_id
        ? (teamName.get(m.home_team_id) ?? "TBD")
        : "TBD",
      awayName: m.away_team_id
        ? (teamName.get(m.away_team_id) ?? "TBD")
        : "TBD",
      refName: m.ref_team_id ? (teamName.get(m.ref_team_id) ?? null) : null,
      poolName: pool?.name ?? null,
      divisionName: pool?.divisionId
        ? (divName.get(pool.divisionId) ?? null)
        : null,
      bracketPosition: m.bracket_position,
    };
  });

  return {
    name: comp.name,
    type: comp.type,
    venue: comp.venue,
    timezone: comp.timezone,
    matches,
  };
}
