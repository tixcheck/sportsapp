import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-[#FAFAFA] px-4 py-12">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 flex items-center justify-center gap-2 text-lg font-semibold tracking-tight text-slate-900"
        >
          <span className="grid size-7 place-items-center rounded-lg bg-sky-500 text-sm text-white">
            V
          </span>
          Volleyball
        </Link>
        {children}
      </div>
    </div>
  );
}
