import Link from "next/link";

import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/support";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- brand logo, fixed height */}
          <img
            src="/mysportsapp-logo.svg"
            alt="MySportsApp"
            className="h-9 w-auto"
          />
        </Link>
        {children}
        <p className="text-muted-foreground mt-8 text-center text-xs">
          Trouble signing in? Email{" "}
          <a href={SUPPORT_MAILTO} className="underline underline-offset-2">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}
