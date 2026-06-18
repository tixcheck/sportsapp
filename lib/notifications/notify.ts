/**
 * Best-effort transactional notifications (Phase 9). Each recipient gets their
 * own email; bodies carry only team names + score/time — never another player's
 * address or roster. Gated by the recipient's pref; degrades silently when
 * email isn't configured or RLS hides an address.
 */
import { DateTime } from "luxon";

import type { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/utils/url";
import { sendResult, sendScheduleChanged } from "@/lib/email/send";
import { matchWinner } from "@/lib/scheduler/tiebreakers";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;
type PrefColumn = "notify_results" | "notify_schedule_changes";

interface Recipient {
  email: string;
  teamId: string;
}

/** Members of the given teams whose `prefColumn` is on and email is readable. */
async function recipientsFor(
  supabase: SupabaseServer,
  teamIds: string[],
  prefColumn: PrefColumn,
): Promise<Recipient[]> {
  const { data: members } = await supabase
    .from("team_members")
    .select("team_id, user_id")
    .in("team_id", teamIds);
  const userIds = [...new Set((members ?? []).map((m) => m.user_id))];
  if (userIds.length === 0) return [];

  const { data: users } = await supabase
    .from("users")
    .select(`id, email, ${prefColumn}`)
    .in("id", userIds);
  const byId = new Map(
    (users ?? []).map((u) => {
      const row = u as Record<string, unknown>;
      return [
        row.id as string,
        { email: row.email as string, on: row[prefColumn] === true },
      ];
    }),
  );

  const out: Recipient[] = [];
  for (const m of members ?? []) {
    const u = byId.get(m.user_id);
    if (u && u.on && u.email) out.push({ email: u.email, teamId: m.team_id });
  }
  return out;
}

function setsWon(
  sets: { home_score: number; away_score: number }[],
): [number, number] {
  let h = 0;
  let a = 0;
  for (const s of sets) {
    if (s.home_score > s.away_score) h += 1;
    else if (s.away_score > s.home_score) a += 1;
  }
  return [h, a];
}

/** Result/score notification to both teams' members (opt-out: notify_results). */
export async function notifyResult(
  supabase: SupabaseServer,
  matchId: string,
): Promise<void> {
  const { data: m } = await supabase
    .from("matches")
    .select("competition_id, home_team_id, away_team_id")
    .eq("id", matchId)
    .single();
  if (!m || !m.home_team_id || !m.away_team_id) return;

  const [{ data: comp }, { data: teams }, { data: sets }] = await Promise.all([
    supabase
      .from("competitions")
      .select("name, slug, type")
      .eq("id", m.competition_id)
      .single(),
    supabase
      .from("teams")
      .select("id, name")
      .in("id", [m.home_team_id, m.away_team_id]),
    supabase
      .from("sets")
      .select("home_score, away_score")
      .eq("match_id", matchId),
  ]);
  if (!comp) return;

  const nameById = new Map((teams ?? []).map((t) => [t.id as string, t.name]));
  const [hw, aw] = setsWon(sets ?? []);
  const homeName = nameById.get(m.home_team_id) ?? "Home";
  const awayName = nameById.get(m.away_team_id) ?? "Away";
  const summary = `${homeName} ${hw} – ${aw} ${awayName}`;
  const winner = matchWinner({
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
    sets: (sets ?? []).map((s) => ({ home: s.home_score, away: s.away_score })),
  });

  const origin = await getOrigin();
  const url = `${origin}/${comp.type === "tournament" ? "t" : "l"}/${comp.slug}`;

  const recipients = await recipientsFor(
    supabase,
    [m.home_team_id, m.away_team_id],
    "notify_results",
  );
  for (const r of recipients) {
    const outcome = winner ? (winner === r.teamId ? "Won" : "Lost") : undefined;
    await sendResult(r.email, {
      competitionName: comp.name,
      matchSummary: summary,
      outcome,
      url,
    });
  }
}

/** Schedule-changed alert (opt-out: notify_schedule_changes). */
export async function notifyScheduleChanged(
  supabase: SupabaseServer,
  matchId: string,
  scheduledAt: string,
  court: string,
): Promise<void> {
  const { data: m } = await supabase
    .from("matches")
    .select("competition_id, home_team_id, away_team_id")
    .eq("id", matchId)
    .single();
  if (!m || !m.home_team_id || !m.away_team_id) return;

  const [{ data: comp }, { data: teams }] = await Promise.all([
    supabase
      .from("competitions")
      .select("name, slug, type, timezone")
      .eq("id", m.competition_id)
      .single(),
    supabase
      .from("teams")
      .select("id, name")
      .in("id", [m.home_team_id, m.away_team_id]),
  ]);
  if (!comp) return;

  const nameById = new Map((teams ?? []).map((t) => [t.id as string, t.name]));
  const summary = `${nameById.get(m.home_team_id) ?? "Home"} vs ${
    nameById.get(m.away_team_id) ?? "Away"
  }`;
  const when = DateTime.fromISO(scheduledAt, {
    zone: comp.timezone ?? "America/Toronto",
  });
  const detail = `${when.isValid ? when.toFormat("ccc, LLL d · h:mm a") : "New time"} · ${court}`;

  const origin = await getOrigin();
  const url = `${origin}/${comp.type === "tournament" ? "t" : "l"}/${comp.slug}`;

  const recipients = await recipientsFor(
    supabase,
    [m.home_team_id, m.away_team_id],
    "notify_schedule_changes",
  );
  for (const r of recipients) {
    await sendScheduleChanged(r.email, {
      competitionName: comp.name,
      matchSummary: summary,
      detail,
      url,
    });
  }
}
