import Link from "next/link";
import { cookies } from "next/headers";

import { getProfile, getUserOrgs } from "@/lib/auth/user";
import { CURRENT_ORG_COOKIE } from "@/lib/org/cookies";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";

export async function Navbar() {
  const [profile, orgs, cookieStore] = await Promise.all([
    getProfile(),
    getUserOrgs(),
    cookies(),
  ]);
  const currentOrgId = cookieStore.get(CURRENT_ORG_COOKIE)?.value;

  return (
    <header className="border-border bg-card/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="font-display text-foreground flex items-center gap-2 font-semibold tracking-tight"
          >
            <span className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-md text-xs">
              V
            </span>
            <span className="hidden sm:inline">Volleyball</span>
          </Link>
          <OrgSwitcher orgs={orgs} currentOrgId={currentOrgId} />
        </div>
        <UserMenu
          displayName={profile?.display_name ?? null}
          email={profile?.email ?? ""}
          avatarUrl={profile?.avatar_url ?? null}
        />
      </div>
    </header>
  );
}
