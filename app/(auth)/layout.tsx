import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="font-display text-foreground mb-8 flex items-center justify-center gap-2 text-lg font-semibold tracking-tight"
        >
          <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-lg text-sm">
            V
          </span>
          Volleyball
        </Link>
        {children}
      </div>
    </div>
  );
}
