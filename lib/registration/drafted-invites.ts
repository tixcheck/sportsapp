/**
 * Which drafted players should be emailed to join.
 *
 * A drafted player is on a team before they have an account; signing up with
 * the email the organizer entered links them (claim_free_agent_signups). Until
 * 2026-10-01 nothing told them to, so the email sat unused ("Guys aren't seeing
 * the email for mens" — Mango Sports).
 *
 * Invite when they're placed on a team, have no account linked, have an email,
 * and that email hasn't been invited yet. Comparing against `invitedEmail`
 * rather than "ever invited" means correcting a typo invites the new address,
 * and re-saving the same details doesn't send twice.
 */
export interface DraftedInviteRow {
  status: string;
  userId: string | null;
  email: string | null;
  placedTeamId: string | null;
  invitedEmail: string | null;
}

export function needsDraftedInvite(
  row: DraftedInviteRow,
  { resend = false }: { resend?: boolean } = {},
): boolean {
  const email = row.email?.trim().toLowerCase();
  if (!email) return false;
  if (row.status !== "placed" || !row.placedTeamId) return false;
  if (row.userId !== null) return false;
  if (resend) return true;
  return (row.invitedEmail ?? "").trim().toLowerCase() !== email;
}
