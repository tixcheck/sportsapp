/**
 * Overall (cross-pool) ranking for a tournament division.
 *
 * The app already ranks every team across its pools — `crossPoolSeedOrder`
 * interleaves by finishing position (all pool winners, then all runners-up, …)
 * and separates each tier by set ratio then point ratio, so a pool that ran to
 * 15 and one that ran to 25 compare on equal footing. But it only ran at one
 * moment: seeding the bracket. The order was computed, used, and thrown away.
 * This surfaces that same order as a table so a team can see where it sits
 * without reading the bracket backwards.
 *
 * Deliberately NOT for leagues. A tiered league's groups are tiers, not
 * parallel pools, and interleaving them would rank tier 6's winner alongside
 * tier 1's. Callers gate on every group carrying a pool id.
 */
import { crossPoolSeedOrder } from "@/lib/scheduler/tiebreakers";

import type { StandingsGroup, StandingsRowView } from "./compute";

/**
 * The groups' teams in cross-pool seed order, renumbered 1..N.
 *
 * Each group's rows must already be ranked within their pool — which is what
 * `loadStandings` returns, and what `crossPoolSeedOrder` expects.
 */
export function overallRows(groups: StandingsGroup[]): StandingsRowView[] {
  const byId = new Map<string, StandingsRowView>();
  for (const g of groups) {
    for (const r of g.rows) byId.set(r.teamId, r);
  }

  return (
    crossPoolSeedOrder(groups.map((g) => g.rows))
      .map((id) => byId.get(id))
      .filter((r): r is StandingsRowView => r !== undefined)
      // `position` is the team's rank WITHIN its pool. Renumbering to the seed is
      // what makes the table read 1..N rather than 1,1,1,2,2,2 — the position
      // field drives both the rank column and the leader's claret highlight.
      .map((r, i) => ({ ...r, position: i + 1 }))
  );
}
