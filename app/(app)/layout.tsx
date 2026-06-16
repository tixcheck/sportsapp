import { requireUser } from "@/lib/auth/user";
import { Navbar } from "@/components/app/navbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth — middleware already gates these routes.
  await requireUser();

  return (
    <div className="bg-background min-h-svh">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
