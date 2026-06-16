import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Uses the low-privilege publishable key (respects
 * RLS). Safe to import in client components.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
