import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The junk-mail warning is the loudest thing on this page on purpose. Outlook,
 * Hotmail and Live reliably file the confirmation under Junk, and a captain who
 * does not know to look there simply never finishes signing up - they assume
 * the site is broken. A BVL exec hit exactly this on a Hotmail address.
 */
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const retryHref = sp.next
    ? `/signup?next=${encodeURIComponent(sp.next)}`
    : "/signup";
  const signInHref = sp.next
    ? `/login?next=${encodeURIComponent(sp.next)}`
    : "/login";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirm your email</CardTitle>
        <CardDescription>
          We have sent you a confirmation link. Click it to verify your email
          and you will be signed in and taken straight back to where you left
          off.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="border-primary/30 bg-primary/5 rounded-lg border p-3">
          <p className="text-sm font-medium">Check your junk or spam folder</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Outlook, Hotmail and Live inboxes usually file it there. Marking it
            as &ldquo;not junk&rdquo; means the rest of your league email lands
            in your inbox.
          </p>
        </div>
        {/*
          Shown to everyone, deliberately. Supabase will not say whether an
          address already has an account - so somebody signing up a second time
          is told to check an inbox nothing is coming to. They get an email
          explaining that, but this is the same answer on the screen in front of
          them, and it gives away nothing that a sign-in page doesn't.
        */}
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground font-medium">Signed up before?</span>{" "}
          If this address already has an account, there&apos;s no new link to
          send &mdash;{" "}
          <Link href={signInHref} className="text-primary hover:underline">
            sign in instead
          </Link>
          .
        </p>
        <p className="text-muted-foreground text-sm">
          It can take a minute to arrive. Still nothing?{" "}
          <Link href={retryHref} className="text-primary hover:underline">
            Try again
          </Link>{" "}
          and double-check the address you typed.
        </p>
      </CardContent>
    </Card>
  );
}
