import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * The sign-in gate on a public registration page.
 *
 * Both doors are offered side by side on purpose. Most people arriving from a
 * league's registration link have never used the platform, and burying "create
 * an account" one click behind "sign in" made a BVL captain click through to
 * the login page only to hunt for the link they actually needed.
 *
 * `returnTo` is the path to come back to. It rides through login, signup, the
 * confirmation email and the auth callback, so whichever door they pick they
 * land back on this page - see lib/utils/safe-next.ts.
 */
export function SignInOrCreate({
  returnTo,
  prompt,
}: {
  returnTo: string;
  prompt: string;
}) {
  const next = encodeURIComponent(returnTo);

  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-sm">{prompt}</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`/signup?next=${next}`}>Create an account</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/login?next=${next}`}>I already have one</Link>
        </Button>
      </div>
    </div>
  );
}
