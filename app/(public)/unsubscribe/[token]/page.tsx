import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Unsubscribe" };

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unsubscribe", { _token: token });
  const ok = !error && data === true;

  return (
    <div className="bg-background flex min-h-svh items-center justify-center px-4">
      <div className="border-border bg-surface w-full max-w-md rounded-2xl border p-8 text-center shadow-sm">
        <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
          {ok ? "You're unsubscribed" : "Link not recognized"}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {ok
            ? "You won't receive the weekly digest anymore. You can re-enable it anytime from your profile's notification settings."
            : "This unsubscribe link is invalid or expired. Manage your notifications from your profile instead."}
        </p>
        <Link
          href="/profile"
          className="text-coral-700 mt-6 inline-block text-sm font-medium hover:underline"
        >
          Go to notification settings →
        </Link>
      </div>
    </div>
  );
}
