import Stripe from "stripe";

/**
 * The platform's Stripe client.
 *
 * Server-only by construction: it reads `STRIPE_SECRET_KEY`, which is absent
 * from the browser bundle, so importing this from a client component yields a
 * client that can't authenticate rather than one that leaks the key. Keep it
 * that way — never re-export anything from here through a "use client" file.
 *
 * Lazily constructed and memoised: building it at module scope would run at
 * import time on every deployment, including the ones with no keys configured,
 * turning "payments aren't switched on" into a boot crash.
 */
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    // Callers gate on currentStripeMode() first, so reaching this is a bug in
    // the caller rather than a configuration problem worth surfacing to a user.
    throw new Error("STRIPE_SECRET_KEY is not set.");
  }
  if (!cached) {
    cached = new Stripe(key, {
      // Tag our traffic so Stripe support can see which app made a call.
      appInfo: { name: "sportsapp", url: "https://mysportsapp.ca" },
    });
  }
  return cached;
}
