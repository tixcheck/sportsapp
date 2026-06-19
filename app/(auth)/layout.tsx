import Link from "next/link";

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
          <img src="/logo.png" alt="MySportsApp" className="h-9 w-auto" />
        </Link>
        {children}
      </div>
    </div>
  );
}
