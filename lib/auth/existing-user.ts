/**
 * Did that sign-up actually create anything?
 *
 * When "Confirm email" is on, Supabase answers a sign-up for an address that
 * ALREADY has an account with a success-shaped response: a user object, no
 * session, and no email sent. It is deliberate — telling the caller "that
 * address is taken" would turn the sign-up form into a way to test whether
 * somebody has an account here.
 *
 * The tell is `identities: []`. A genuinely new sign-up comes back with one
 * identity; the obfuscated reply has none.
 *
 * This cost a real person a real registration: an address that had an account
 * since June was sent to "Confirm your email", where it waited for a message
 * Supabase was never going to send. We keep the browser response identical —
 * the enumeration protection is worth having — and put the truth in the inbox,
 * which only the account's owner can read.
 */

export interface SignUpUserLike {
  identities?: unknown[] | null;
}

export function isExistingUser(
  user: SignUpUserLike | null | undefined,
  session: unknown | null | undefined,
): boolean {
  if (!user) return false;
  // A session means they are signed in, so it plainly worked.
  if (session) return false;
  // Absent (rather than empty) identities is a shape we don't recognise —
  // treat it as a normal sign-up rather than emailing someone "you already
  // have an account" when they may not.
  if (!Array.isArray(user.identities)) return false;
  return user.identities.length === 0;
}
