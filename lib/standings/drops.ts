/**
 * Drop-a-game gating (v1). Pure: which teams in a needs_drop pool still have no
 * game dropped. Bracket generation is blocked while any exist — enforced in the
 * UI and again server-side in generateBracketAction (defense in depth).
 */

export interface DropTeam {
  teamId: string;
  /** The team's pool has needs_drop set. */
  poolNeedsDrop: boolean;
  /** The match this team has chosen to drop (teams.dropped_match_id). */
  droppedMatchId: string | null;
}

/** Team ids in a flagged pool that haven't picked a game to drop yet. */
export function teamsMissingDrops(teams: DropTeam[]): string[] {
  return teams
    .filter((t) => t.poolNeedsDrop && !t.droppedMatchId)
    .map((t) => t.teamId);
}
