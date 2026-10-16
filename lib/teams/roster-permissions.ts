/**
 * Who may change a team's roster, and what (2026-10-16).
 *
 * Organizers could always do everything; captains could only invite. BVL's
 * captains spent the first week of the season asking the convenor to remove
 * players and cancel wrong invites, so the captain now manages their own
 * roster too — inside two limits:
 *   - never the captain's own seat: removing a captain leaves a team nobody
 *     answers for (the organizer hands the captaincy over instead);
 *   - never a Reverse Pairs partner who has joined: that changes who the pair
 *     IS, and the event's draw is built around it, so it stays the organizer's.
 *
 * Returns the reason it's refused, or null when allowed. RLS already lets a
 * captain write their own team's members and invites (team_members_manage,
 * team_invites_captain_all); this is the rule the actions and the page share.
 */
export type RosterChange =
  | { kind: "remove_member"; targetRole: "captain" | "player" }
  | { kind: "edit_invite"; targetRole: "captain" | "player" }
  | { kind: "remove_invite"; targetRole: "captain" | "player" };

export function rosterChangeRefusal(opts: {
  isAdmin: boolean;
  isCaptain: boolean;
  competitionType: string;
  change: RosterChange;
}): string | null {
  const { change } = opts;
  if (change.kind === "remove_member" && change.targetRole === "captain") {
    return "Make someone else captain first — a team can't be left without one.";
  }
  if (opts.isAdmin) return null;
  if (!opts.isCaptain)
    return "Only the captain or organizer can manage this team.";
  if (change.targetRole === "captain") {
    return "Only the organizer can change the captain.";
  }
  if (
    change.kind === "remove_member" &&
    opts.competitionType === "reverse_pairs"
  ) {
    return "Ask the organizer to change your partner.";
  }
  return null;
}
