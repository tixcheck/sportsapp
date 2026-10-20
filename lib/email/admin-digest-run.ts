/**
 * Sends the organizers' Sunday to-do email (see admin-digest.ts for what's in
 * it). Run by the weekly-digest cron rather than its own entry: this project
 * is on Vercel Hobby, where a bad `crons` block rejects the whole deployment.
 *
 * Reads across every org with the secret-key client, so it's server-only and
 * cron-only. Idempotent per (user, ISO week) via notification_log.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";

import { sendAdminDigest } from "@/lib/email/send";
import {
  buildAdminDigest,
  isUnscored,
  UNSCORED_LOOKBACK_DAYS,
  type AdminDigestCompetition,
  type AdminDigestSection,
  type DigestGame,
} from "@/lib/email/admin-digest";

const ACTIVE = ["open", "scheduled", "in_progress"];

const SEGMENT: Record<string, string> = {
  league: "leagues",
  tournament: "tournaments",
  reverse_pairs: "reverse-pairs",
  kotc: "kotc",
};

type Comp = {
  id: string;
  org_id: string;
  name: string;
  type: string;
  timezone: string | null;
};

/** `.in()` goes in the URL, so long id lists are split. */
async function inChunks<T>(
  ids: string[],
  load: (chunk: string[]) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await load(ids.slice(i, i + 150));
    out.push(...(data ?? []));
  }
  return out;
}

export async function runAdminDigest(
  admin: SupabaseClient,
  opts: {
    origin: string;
    periodKey: string;
    dry: boolean;
    now?: DateTime;
    /** Dry runs only: see what each organizer would get. */
    onPreview?: (userId: string, sections: AdminDigestSection[]) => void;
  },
): Promise<{ sent: number; skipped: number; organizers: number }> {
  const now = opts.now ?? DateTime.utc();
  // A league that ended last week can still have a game nobody scored.
  const endedSince = now.minus({ days: 14 }).toISODate()!;
  const { data: compRows } = await admin
    .from("competitions")
    .select("id, org_id, name, type, timezone")
    .in("status", ACTIVE)
    .or(`end_date.is.null,end_date.gte.${endedSince}`);
  const comps = (compRows ?? []) as Comp[];
  if (comps.length === 0) return { sent: 0, skipped: 0, organizers: 0 };
  const compIds = comps.map((c) => c.id);

  const since = now.minus({ days: UNSCORED_LOOKBACK_DAYS }).toISO()!;
  const [matches, heldTeams, payments, freeAgents, waitlist] =
    await Promise.all([
      inChunks(compIds, (ids) =>
        admin
          .from("matches")
          .select(
            "id, competition_id, status, scheduled_at, home_team_id, away_team_id, division_id, round",
          )
          .in("competition_id", ids)
          .in("status", ["scheduled", "in_progress"])
          .gte("scheduled_at", since)
          .lte("scheduled_at", now.toISO()!),
      ),
      inChunks(compIds, (ids) =>
        admin
          .from("teams")
          .select("id, competition_id, name, status")
          .in("competition_id", ids)
          .in("status", ["pending_payment", "pending_waiver"]),
      ),
      inChunks(compIds, (ids) =>
        admin
          .from("registration_payments")
          .select(
            "competition_id, team_id, free_agent_id, method, total_cents, created_at",
          )
          .in("competition_id", ids)
          .eq("status", "pending")
          // Card checkouts settle themselves; only money the organizer has to
          // vouch for is a to-do.
          .neq("method", "card"),
      ),
      inChunks(compIds, (ids) =>
        admin
          .from("free_agents")
          .select("competition_id")
          .in("competition_id", ids)
          .eq("status", "available"),
      ),
      inChunks(compIds, (ids) =>
        admin
          .from("waitlist_entries")
          .select("competition_id")
          .in("competition_id", ids)
          .eq("status", "waiting")
          .is("offered_at", null),
      ),
    ]);

  type M = {
    id: string;
    competition_id: string;
    status: string;
    scheduled_at: string | null;
    home_team_id: string | null;
    away_team_id: string | null;
    division_id: string | null;
    round: number | null;
  };
  const games = matches as M[];

  // Ladders that type in each tier's finishing order (0117) record no games:
  // a tier-night with an order is settled, and one without is a single to-do.
  const placements = await inChunks(compIds, (ids) =>
    admin
      .from("ladder_placements")
      .select("competition_id, division_id, week")
      .in("competition_id", ids)
      .not("result_rank", "is", null),
  );
  const ranksByPlacement = new Set<string>();
  const rankedNight = new Set<string>();
  for (const p of placements as {
    competition_id: string;
    division_id: string;
    week: number;
  }[]) {
    ranksByPlacement.add(p.competition_id);
    rankedNight.add(`${p.division_id}|${p.week}`);
  }
  const divisionIds = [
    ...new Set(games.map((m) => m.division_id).filter((d): d is string => !!d)),
  ];
  const divisionName = new Map(
    (
      (await inChunks(divisionIds, (ids) =>
        admin.from("divisions").select("id, name").in("id", ids),
      )) as { id: string; name: string }[]
    ).map((d) => [d.id, d.name]),
  );
  const tierNights = new Set<string>();
  const matchIds = games.map((m) => m.id);
  const [sets, confs] = await Promise.all([
    inChunks(matchIds, (ids) =>
      admin.from("sets").select("match_id").in("match_id", ids),
    ),
    inChunks(matchIds, (ids) =>
      admin
        .from("match_confirmations")
        .select("match_id, action, created_at")
        .in("match_id", ids)
        .order("created_at", { ascending: true }),
    ),
  ]);
  const scored = new Set(
    (sets as { match_id: string }[]).map((s) => s.match_id),
  );
  const latest = new Map<string, string>();
  for (const c of confs as { match_id: string; action: string }[]) {
    latest.set(c.match_id, c.action);
  }

  const teamIds = new Set<string>();
  for (const m of games) {
    if (m.home_team_id) teamIds.add(m.home_team_id);
    if (m.away_team_id) teamIds.add(m.away_team_id);
  }
  type P = {
    competition_id: string;
    team_id: string | null;
    free_agent_id: string | null;
    method: string;
    total_cents: number;
    created_at: string;
  };
  for (const p of payments as P[]) if (p.team_id) teamIds.add(p.team_id);
  const faIds = (payments as P[])
    .map((p) => p.free_agent_id)
    .filter((x): x is string => !!x);
  const [teamRows, faRows] = await Promise.all([
    inChunks([...teamIds], (ids) =>
      admin.from("teams").select("id, name").in("id", ids),
    ),
    inChunks(faIds, (ids) =>
      admin.from("free_agents").select("id, name").in("id", ids),
    ),
  ]);
  const teamName = new Map(
    (teamRows as { id: string; name: string }[]).map((t) => [t.id, t.name]),
  );
  const faName = new Map(
    (faRows as { id: string; name: string }[]).map((f) => [f.id, f.name]),
  );

  const byComp = new Map<string, AdminDigestCompetition>();
  for (const c of comps) {
    byComp.set(c.id, {
      competitionId: c.id,
      name: c.name,
      timezone: c.timezone ?? "America/Toronto",
      url: `${opts.origin}/orgs/${c.org_id}/${SEGMENT[c.type] ?? "leagues"}/${c.id}`,
      unscored: [],
      unrankedTiers: [],
      awaitingConfirmation: [],
      disputed: [],
      paymentsToConfirm: [],
      heldTeams: [],
      freeAgentsToPlace: 0,
      waitlisted: 0,
    });
  }

  for (const m of games) {
    const c = byComp.get(m.competition_id);
    if (!c || !m.scheduled_at) continue;
    const g: DigestGame = {
      summary: `${teamName.get(m.home_team_id ?? "") ?? "TBD"} vs ${teamName.get(m.away_team_id ?? "") ?? "TBD"}`,
      scheduledAt: m.scheduled_at,
    };
    const hasSets = scored.has(m.id);
    const action = latest.get(m.id);
    if (!hasSets && ranksByPlacement.has(m.competition_id) && m.division_id) {
      const night = `${m.division_id}|${m.round}`;
      if (rankedNight.has(night) || tierNights.has(night)) continue;
      if (
        isUnscored(
          {
            status: m.status,
            scheduledAt: m.scheduled_at,
            hasTeams: !!m.home_team_id && !!m.away_team_id,
            hasSets,
          },
          now,
        )
      ) {
        tierNights.add(night);
        c.unrankedTiers.push({
          summary: divisionName.get(m.division_id) ?? "A tier",
          scheduledAt: m.scheduled_at,
        });
      }
      continue;
    }
    if (hasSets && action === "disputed") c.disputed.push(g);
    else if (hasSets && action === "submitted") c.awaitingConfirmation.push(g);
    else if (
      isUnscored(
        {
          status: m.status,
          scheduledAt: m.scheduled_at,
          hasTeams: !!m.home_team_id && !!m.away_team_id,
          hasSets,
        },
        now,
      )
    )
      c.unscored.push(g);
  }
  for (const t of heldTeams as {
    competition_id: string;
    name: string;
    status: string;
  }[]) {
    byComp.get(t.competition_id)?.heldTeams.push({
      name: t.name,
      reason: t.status === "pending_payment" ? "payment" : "waiver",
    });
  }
  for (const p of payments as P[]) {
    byComp.get(p.competition_id)?.paymentsToConfirm.push({
      payer:
        (p.team_id && teamName.get(p.team_id)) ||
        (p.free_agent_id && faName.get(p.free_agent_id)) ||
        "A player",
      amountCents: p.total_cents,
      method: p.method,
      since: p.created_at,
    });
  }
  for (const f of freeAgents as { competition_id: string }[]) {
    const c = byComp.get(f.competition_id);
    if (c) c.freeAgentsToPlace += 1;
  }
  for (const w of waitlist as { competition_id: string }[]) {
    const c = byComp.get(w.competition_id);
    if (c) c.waitlisted += 1;
  }

  // Who runs what: everyone on the org, plus per-event co-organizers.
  const orgIds = [...new Set(comps.map((c) => c.org_id))];
  const [members, coAdmins] = await Promise.all([
    inChunks(orgIds, (ids) =>
      admin.from("org_members").select("org_id, user_id").in("org_id", ids),
    ),
    inChunks(compIds, (ids) =>
      admin
        .from("competition_admins")
        .select("competition_id, user_id")
        .in("competition_id", ids),
    ),
  ]);
  const compsOf = new Map<string, Set<string>>();
  const add = (u: string, c: string) => {
    const s = compsOf.get(u) ?? new Set<string>();
    s.add(c);
    compsOf.set(u, s);
  };
  for (const m of members as { org_id: string; user_id: string }[]) {
    for (const c of comps) if (c.org_id === m.org_id) add(m.user_id, c.id);
  }
  for (const a of coAdmins as { competition_id: string; user_id: string }[]) {
    add(a.user_id, a.competition_id);
  }

  const users = await inChunks([...compsOf.keys()], (ids) =>
    admin
      .from("users")
      .select("id, email, notify_admin_digest, unsubscribe_token")
      .in("id", ids),
  );

  let sent = 0;
  let skipped = 0;
  for (const u of users as {
    id: string;
    email: string | null;
    notify_admin_digest: boolean;
    unsubscribe_token: string;
  }[]) {
    if (!u.email || !u.notify_admin_digest) continue;
    // Demo and test organizers: the address can't receive mail, and a bounce
    // counts against the sending domain.
    if (/@example\.(com|org|net)$/i.test(u.email)) continue;
    const sections = buildAdminDigest(
      [...(compsOf.get(u.id) ?? [])]
        .map((id) => byComp.get(id))
        .filter((c): c is AdminDigestCompetition => !!c),
    );
    if (sections.length === 0) continue;

    if (opts.dry) {
      opts.onPreview?.(u.id, sections);
      sent += 1;
      continue;
    }
    const { data: claim } = await admin
      .from("notification_log")
      .upsert(
        { user_id: u.id, kind: "admin_weekly", period_key: opts.periodKey },
        { onConflict: "user_id,kind,period_key", ignoreDuplicates: true },
      )
      .select("id");
    if (!claim || claim.length === 0) {
      skipped += 1;
      continue;
    }
    await sendAdminDigest(u.email, {
      sections,
      dashboardUrl: `${opts.origin}/dashboard`,
      unsubscribeUrl: `${opts.origin}/unsubscribe/${u.unsubscribe_token}?kind=admin`,
    });
    sent += 1;
  }

  return { sent, skipped, organizers: compsOf.size };
}
