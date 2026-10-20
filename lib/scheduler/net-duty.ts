/**
 * Net duty: which team puts the net up on each court.
 *
 * BVL's rule (Theresa, 2026-10-19): "everybody has to do Nets, and no team is
 * doing it more than others", so setup "doesn't fall on the referee". A net
 * only needs putting up before the first game on a court in a gym that night;
 * when two tiers share a gym, the late tier plays on nets already up. One of
 * that first game's two teams sets up.
 *
 * Who is chosen is balanced over the season, one window (a BVL round, or a
 * night) at a time: within a window the picks are moved around until no team
 * has two more turns than another it could hand one to, counting the turns it
 * already did in earlier windows. A team that sat out last round goes first
 * this round. Earlier windows are never revisited, so drawing next round
 * can't change who set up last week.
 *
 * Pure: plain games in, a map out.
 */

/** How early a net-duty team arrives (Theresa, BVL, 2026-10-19: "ten minute is good"). */
export const NET_SETUP_MINUTES = 10;

export interface NetDutyGame {
  id: string;
  /** The gym. Games in different gyms never share a net. */
  gym: string;
  /** The local date, YYYY-MM-DD. */
  night: string;
  court: string;
  /** ISO start time. */
  startsAt: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** Balancing window, compared as a string: a round number padded, or the night. */
  window: string;
}

export interface NetDutyOptions {
  /** Picks already published (Theresa's Wednesday sheet): game id → team id. */
  fixed?: Map<string, string>;
}

/** The first game on each court in each gym each night: the ones that need a net put up. */
export function netSetupGames(games: NetDutyGame[]): NetDutyGame[] {
  const first = new Map<string, NetDutyGame>();
  for (const g of games) {
    const key = `${g.gym}|${g.night}|${g.court}`;
    const cur = first.get(key);
    if (!cur || g.startsAt < cur.startsAt) first.set(key, g);
  }
  return [...first.values()].sort(
    (a, b) =>
      a.startsAt.localeCompare(b.startsAt) ||
      a.gym.localeCompare(b.gym) ||
      a.court.localeCompare(b.court),
  );
}

/** Game id → the team that sets up its net. Games whose teams aren't known yet get none. */
export function assignNetDuty(
  games: NetDutyGame[],
  opts: NetDutyOptions = {},
): Map<string, string> {
  const fixed = opts.fixed ?? new Map<string, string>();
  const slots = netSetupGames(games).filter(
    (g) => g.homeTeamId && g.awayTeamId && g.homeTeamId !== g.awayTeamId,
  );
  const windows = [...new Set(slots.map((s) => s.window))].sort();
  const load = new Map<string, number>();
  const loadOf = (t: string) => load.get(t) ?? 0;
  const out = new Map<string, string>();

  for (const w of windows) {
    const here = slots.filter((s) => s.window === w);
    const pick = new Map<string, string>();
    const locked = new Set<string>();

    for (const s of here) {
      const home = s.homeTeamId!;
      const away = s.awayTeamId!;
      const f = fixed.get(s.id);
      let team: string;
      if (f === home || f === away) {
        team = f;
        locked.add(s.id);
      } else {
        // Fewer turns so far goes; a tie goes to the away team, so the
        // first-listed (home) team isn't always the one let off.
        team = loadOf(home) < loadOf(away) ? home : away;
      }
      pick.set(s.id, team);
      load.set(team, loadOf(team) + 1);
    }

    rebalance(here, pick, locked, load);
    for (const [id, team] of pick) out.set(id, team);
  }
  return out;
}

/**
 * Hand turns along chains of games until no team has two more than one it
 * can reach. Each pass lowers the sum of squared loads, so it ends.
 */
function rebalance(
  slots: NetDutyGame[],
  pick: Map<string, string>,
  locked: Set<string>,
  load: Map<string, number>,
) {
  const loadOf = (t: string) => load.get(t) ?? 0;
  const other = (s: NetDutyGame, t: string) =>
    s.homeTeamId === t ? s.awayTeamId! : s.homeTeamId!;
  const movable = slots.filter((s) => !locked.has(s.id));

  for (;;) {
    const teams = [...new Set(movable.map((s) => pick.get(s.id)!))].sort(
      (a, b) => loadOf(b) - loadOf(a) || a.localeCompare(b),
    );
    let moved = false;
    for (const start of teams) {
      // Breadth-first along "start could pass this game to its opponent".
      const via = new Map<string, NetDutyGame>([[start, null!]]);
      const queue = [start];
      let target: string | null = null;
      while (queue.length && !target) {
        const t = queue.shift()!;
        for (const s of movable) {
          if (pick.get(s.id) !== t) continue;
          const o = other(s, t);
          if (via.has(o)) continue;
          via.set(o, s);
          if (loadOf(o) <= loadOf(start) - 2) {
            target = o;
            break;
          }
          queue.push(o);
        }
      }
      if (!target) continue;
      // Flip each game on the path: the far end gains one, start loses one.
      let t = target;
      while (t !== start) {
        const s = via.get(t)!;
        const from = other(s, t);
        pick.set(s.id, t);
        t = from;
      }
      load.set(target, loadOf(target) + 1);
      load.set(start, loadOf(start) - 1);
      moved = true;
      break;
    }
    if (!moved) return;
  }
}
