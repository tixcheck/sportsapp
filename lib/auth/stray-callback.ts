/**
 * Did an auth link land somewhere other than /auth/callback?
 *
 * Supabase sends the confirmation click to its own verify endpoint, which then
 * redirects to `redirect_to` — but only if that URL is in the project's
 * Redirect URLs allow list. When it is not, Supabase falls back to the Site
 * URL, so the code arrives on the home page instead of the callback. Nothing
 * there spends it: the captain is dropped on a marketing page, still signed
 * out, with no sign they were half-way through registering. A BVL organizer
 * reported exactly that.
 *
 * Rather than leave the flow depending on a dashboard setting nobody can see
 * from the code, any page carrying an auth code is forwarded to the callback.
 * Pure so it can be tested without constructing a NextRequest.
 */

/** A Supabase PKCE code is a UUID. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StrayCallback {
  /** What to put in `?next=`, or null to leave whatever is already there. */
  next: string | null;
}

export function detectStrayCallback(
  pathname: string,
  params: URLSearchParams,
): StrayCallback | null {
  if (pathname.startsWith("/auth/callback")) return null;

  const code = params.get("code");
  const hasOtp = params.has("token_hash") && params.has("type");

  // "code" is a common enough query-string name that it could belong to the
  // page it arrived on — a discount code, a referral code. Only a value shaped
  // like a Supabase PKCE code is treated as one.
  const hasCode = code !== null && UUID.test(code);
  if (!hasCode && !hasOtp) return null;

  if (params.has("next")) return { next: null };

  // No destination survived. The path the link landed on is itself a better
  // guess than the dashboard — except "/", which is the fallback that caused
  // the problem and says nothing about where they were going.
  return { next: pathname === "/" ? null : pathname };
}
