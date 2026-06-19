import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms — MySportsApp" };

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="text-ink-3 mt-1 text-sm">Last updated June 19, 2026</p>

        <div className="text-ink-2 mt-8 space-y-4 text-sm leading-relaxed">
          <p>
            By creating an account or using MySportsApp, you agree to these
            terms. If you don&apos;t agree, please don&apos;t use the service.
          </p>
          <p>
            <strong className="text-ink font-semibold">The service.</strong>{" "}
            MySportsApp is provided free of charge to organize and follow
            volleyball competitions. We may change or discontinue features over
            time.
          </p>
          <p>
            <strong className="text-ink font-semibold">
              Your responsibilities.
            </strong>{" "}
            Keep your login secure, provide accurate information, and use the
            service lawfully and respectfully toward other participants.
          </p>
          <p>
            <strong className="text-ink font-semibold">Your content.</strong>{" "}
            You keep ownership of the competition data you create; you grant us
            permission to host and display it as needed to run the service.
          </p>
          <p>
            <strong className="text-ink font-semibold">No warranty.</strong> The
            service is provided &ldquo;as is,&rdquo; without warranties, and we
            aren&apos;t liable for losses arising from its use to the extent
            permitted by law.
          </p>
          <p>
            <strong className="text-ink font-semibold">Contact.</strong>{" "}
            Questions about these terms? Email{" "}
            <a
              href="mailto:hello@mysportsapp.app"
              className="text-claret hover:underline"
            >
              hello@mysportsapp.app
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
