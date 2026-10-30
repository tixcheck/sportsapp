import "server-only";

import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Spend one unit of a rate limit (0190). True = go ahead.
 *
 * The limits themselves are in `take_rate_limit`, so a caller can't raise
 * them: `account_exists` is 1 an hour per address, `invite` 40 a day per
 * signed-in user, `places` 300 a day per signed-in user.
 *
 * Fails OPEN on a database error: these guard against abuse, and a blip in
 * the counter shouldn't stop a captain inviting their team.
 */
export async function takeRateLimit(
  supabase: Supabase,
  bucket: "account_exists" | "invite" | "places",
  subject?: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("take_rate_limit", {
    _bucket: bucket,
    _subject: subject ?? null,
  });
  if (error) {
    console.error("[rate-limit] check failed", bucket, error.code);
    return true;
  }
  return data === true;
}
