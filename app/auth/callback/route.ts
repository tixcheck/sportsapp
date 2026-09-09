import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { safeNext, DEFAULT_NEXT } from "@/lib/utils/safe-next";
import {
  PENDING_REGISTRATION_COOKIE,
  isRegistrationPath,
} from "@/lib/auth/pending-registration";

/**
 * Auth callback for email-link flows (verification + password recovery).
 *
 * Supabase email templates emit one of two link formats depending on project
 * config, so we handle both:
 *   - PKCE:  `?code=...`            -> exchangeCodeForSession
 *   - OTP:   `?token_hash=...&type` -> verifyOtp
 * Either way the auth cookies are written by the server client and we continue
 * to `next`. On failure we send the user back to /login with an error.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const nextParam = searchParams.get("next");
  const destination = resolveDestination(nextParam, request);

  const supabase = await createClient();

  const finish = () => {
    const response = NextResponse.redirect(`${origin}${destination}`);
    // The registration is no longer pending - either we just sent them to it,
    // or they went somewhere else deliberately. Leaving it set would hijack an
    // unrelated sign-in later on the same machine.
    response.cookies.delete(PENDING_REGISTRATION_COOKIE);
    return response;
  };

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return finish();
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return finish();
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Sign-in link is invalid or has expired.")}`,
  );
}

/**
 * The URL's `next` is authoritative when it says anything real. It is only when
 * the link arrived without one - Supabase dropped it, or the middleware
 * forwarded a bare `?code=` off the home page - that we fall back to the
 * registration the browser was part-way through.
 */
function resolveDestination(
  nextParam: string | null,
  request: NextRequest,
): string {
  const fromUrl = safeNext(nextParam);
  if (nextParam && fromUrl !== DEFAULT_NEXT) return fromUrl;

  const pending = request.cookies.get(PENDING_REGISTRATION_COOKIE)?.value;
  if (!pending) return fromUrl;

  // The cookie is ours, but it still round-tripped through a browser: re-run
  // the same open-redirect checks as anything off a query string.
  const safe = safeNext(pending);
  return isRegistrationPath(safe) ? safe : fromUrl;
}
