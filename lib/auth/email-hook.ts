import type { AuthAction } from "@/lib/email/templates/auth-action";
import { safeNext, DEFAULT_NEXT } from "@/lib/utils/safe-next";

/**
 * Reading a Supabase Send Email Hook payload.
 *
 * Pure, because the interesting decisions here are all string handling and the
 * route around them cannot be unit-tested: which action this is, where the link
 * should point, and which league (if any) the reader was signing up for.
 *
 * The link is the important part. Supabase's own confirmation link goes to its
 * verify endpoint, which then honours `redirect_to` ONLY if that URL is in the
 * project's Redirect URLs allow list — and silently drops it to the Site URL if
 * not. That is what stranded a BVL captain on the home page. Sending the email
 * ourselves means we can link straight at our own callback with the token hash,
 * so the allow list stops being able to break the flow at all.
 */

export interface EmailHookPayload {
  user?: { email?: string | null } | null;
  email_data?: {
    token_hash?: string | null;
    email_action_type?: string | null;
    redirect_to?: string | null;
  } | null;
}

export interface EmailHookRequest {
  to: string;
  action: AuthAction;
  /** Our own callback, carrying the token and the onward destination. */
  actionUrl: string;
  /** `/register/<slug>` when they were mid-registration, else null. */
  registrationSlug: string | null;
}

const ACTIONS: Record<string, AuthAction> = {
  signup: "confirm",
  invite: "confirm",
  confirmation: "confirm",
  signup_confirmation: "confirm",
  magiclink: "magiclink",
  recovery: "recovery",
  email_change: "email_change",
  email_change_current: "email_change",
  email_change_new: "email_change",
};

/**
 * The OTP `type` our callback passes to verifyOtp. Not the same vocabulary as
 * `email_action_type`: Supabase names the EMAIL one way and the VERIFICATION
 * another, and crossing them produces a link that always fails.
 */
const OTP_TYPES: Record<AuthAction, string> = {
  confirm: "email",
  magiclink: "magiclink",
  recovery: "recovery",
  email_change: "email_change",
};

export function parseEmailHook(
  payload: EmailHookPayload,
  origin: string,
): EmailHookRequest | null {
  const to = payload.user?.email?.trim();
  const tokenHash = payload.email_data?.token_hash?.trim();
  if (!to || !tokenHash) return null;

  const rawType = payload.email_data?.email_action_type?.trim().toLowerCase();
  // An unrecognised action still needs an email — better a generic confirm than
  // a user who is never told anything. Auth emails have no safe silent failure.
  const action = (rawType && ACTIONS[rawType]) || "confirm";

  const next = destinationFrom(payload.email_data?.redirect_to, action);
  const url = new URL(`${origin.replace(/\/+$/, "")}/auth/callback`);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", OTP_TYPES[action]);
  url.searchParams.set("next", next);

  return {
    to,
    action,
    actionUrl: url.toString(),
    registrationSlug: next.startsWith("/register/")
      ? next.slice("/register/".length).split(/[/?#]/)[0] || null
      : null,
  };
}

/**
 * Where to send them after the link is spent.
 *
 * `redirect_to` is whatever we passed as `emailRedirectTo`, which is itself our
 * callback with a `next` — so the destination is usually one level in. It has
 * still been through Supabase, so it is re-checked by safeNext like any other
 * untrusted string rather than trusted for having come back to us.
 */
function destinationFrom(
  redirectTo: string | null | undefined,
  action: AuthAction,
): string {
  const fallback = action === "recovery" ? "/reset-password" : DEFAULT_NEXT;
  if (!redirectTo) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(redirectTo);
  } catch {
    // A bare path rather than an absolute URL.
    return safeNext(redirectTo, fallback);
  }

  const inner = parsed.searchParams.get("next");
  if (inner) return safeNext(inner, fallback);
  return safeNext(parsed.pathname + parsed.search, fallback);
}
