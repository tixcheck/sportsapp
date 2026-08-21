import type { Metadata } from "next";

import { WaitlistClaim } from "@/components/registration/waitlist-claim";

export const metadata: Metadata = {
  title: "Claim your spot",
  robots: { index: false, follow: false },
};

/**
 * Claiming an offered spot.
 *
 * Under `(app)`, so the layout already requires a signed-in user — claiming
 * creates a team captained by whoever acts on the link, which needs an account.
 * The claim itself is a deliberate button press rather than something that
 * happens on page load: an email client that pre-fetches links would otherwise
 * register a team on the recipient's behalf.
 */
export default async function ClaimWaitlistSpotPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <div className="mx-auto max-w-md py-8">
      <WaitlistClaim token={token} />
    </div>
  );
}
