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
