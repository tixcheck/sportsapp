import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy — MySportsApp" };

export default function PrivacyPage() {
  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="border-rule border-b">
        <div className="mx-auto max-w-3xl px-5 py-5">
          <Link
            href="/"
            className="text-ink-2 hover:text-ink text-sm font-medium"
          >
            ← Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-ink-3 mt-1 text-sm">Last updated June 19, 2026</p>

        <div className="text-ink-2 mt-8 space-y-4 text-sm leading-relaxed">
          <p>
            MySportsApp helps organizers run volleyball leagues and tournaments
            and helps players and fans follow them. This page explains what we
            collect and why.
          </p>
          <p>
            <strong className="text-ink font-semibold">What we collect.</strong>{" "}
            Your account details (email and display name) and the competition
            data you create or take part in — teams, rosters, schedules, scores,
            and standings.
          </p>
          <p>
            <strong className="text-ink font-semibold">How we use it.</strong>{" "}
            To run the competitions you organize or play in, to show schedules
            and standings, and to send essential messages such as invitations
            and result confirmations. We don&apos;t sell your personal data.
          </p>
          <p>
            <strong className="text-ink font-semibold">Your choices.</strong>{" "}
            You can edit your profile, opt out of non-essential emails from your
            settings, and request deletion of your account by contacting us.
          </p>
          <p>
            <strong className="text-ink font-semibold">Contact.</strong>{" "}
            Questions about privacy? Email{" "}
            <a
              href="mailto:privacy@mysportsapp.app"
              className="text-claret hover:underline"
            >
              privacy@mysportsapp.app
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
