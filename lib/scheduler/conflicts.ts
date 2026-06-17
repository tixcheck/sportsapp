/**
 * Scheduling conflict detection (Phase 4b). Pure: no DB access. A "slot" is the
 * exact scheduled instant; a conflict is the same court booked twice in a slot,
 * or a team playing twice in a slot.
 */

export interface SlotMatch {
  id: string;
  scheduledAt: string | null;
  court: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
}

export interface SlotConflict {
  type: "court" | "team";
  matchId: string;
}

export function detectConflicts(
  target: { id: string; homeTeamId: string | null; awayTeamId: string | null },
  scheduledAt: string,
  court: string | null,
  others: SlotMatch[],
): SlotConflict[] {
  const slot = new Date(scheduledAt).getTime();
  if (Number.isNaN(slot)) return [];

  const teams = new Set(
    [target.homeTeamId, target.awayTeamId].filter(Boolean) as string[],
  );
  const conflicts: SlotConflict[] = [];

  for (const o of others) {
    if (o.id === target.id || !o.scheduledAt) continue;
    if (new Date(o.scheduledAt).getTime() !== slot) continue;

    if (court && o.court === court) {
      conflicts.push({ type: "court", matchId: o.id });
    }
    if (
      (o.homeTeamId && teams.has(o.homeTeamId)) ||
      (o.awayTeamId && teams.has(o.awayTeamId))
    ) {
      conflicts.push({ type: "team", matchId: o.id });
    }
  }

  return conflicts;
}
