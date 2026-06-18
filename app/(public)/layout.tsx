import Link from "next/link";
import { LayoutDashboard } from "lucide-react";

import { getProfile, getUser } from "@/lib/auth/user";
import { UserMenu } from "@/components/app/user-menu";

/**
 * Public pages render their own full-bleed header. For a *logged-in* visitor we
 * add a slim persistent bar on top so they can get back to their dashboard —
 * anonymous visitors see nothing extra and keep the plain public experience.
 */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  const profile = user ? await getProfile() : null;

  return (
    <>
      {user && (
        <header className="border-border bg-card/80 sticky top-0 z-40 border-b backdrop-blur">
          <div className="mx-auto flex h-12 max-w-4xl items-center justify-between gap-3 px-4">
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium"
            >
              <LayoutDashboard className="size-4" />
              Dashboard
            </Link>
            <UserMenu
              displayName={profile?.display_name ?? null}
              email={profile?.email ?? ""}
              avatarUrl={profile?.avatar_url ?? null}
            />
          </div>
        </header>
      )}
      {children}
    </>
  );
}
