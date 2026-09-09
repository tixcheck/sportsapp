/**
 * Where a half-finished registration was headed, remembered across the gap
 * between "create your account" and clicking the link in the confirmation
 * email.
 *
 * The destination normally rides in the URL — /signup?next=… becomes
 * emailRedirectTo=/auth/callback?next=… and the callback sends them back. That
 * chain has one link we do not control: Supabase validates `emailRedirectTo`
 * against its own Redirect URLs allow list and, when it does not match, drops
 * the destination and uses the project's Site URL instead. The captain lands on
 * the home page with no idea what to do next, which is exactly what a BVL
 * organizer reported.
 *
 * So the destination is also written to a cookie at sign-up. If the URL still
 * carries it, the URL wins — the cookie is only a fallback for the case where
 * something upstream threw it away.
 *
 * `lax` is required, not incidental: the click arrives as a top-level GET from
 * a mail client on another origin, and `strict` would withhold the cookie on
 * precisely that navigation.
 */
export const PENDING_REGISTRATION_COOKIE = "pending_registration";

/**
 * Long enough to survive a confirmation email read the next morning, short
 * enough that a stale destination cannot resurface weeks later on a shared
 * machine.
 */
export const PENDING_REGISTRATION_MAX_AGE = 60 * 60 * 24; // 24 hours

/** Registration paths are the only destinations worth remembering. */
export function isRegistrationPath(path: string): boolean {
  return path.startsWith("/register/");
}

export const pendingRegistrationCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: PENDING_REGISTRATION_MAX_AGE,
} as const;
