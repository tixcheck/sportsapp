import Link from "next/link";
import { cookies } from "next/headers";

import { getProfile, getUserOrgs } from "@/lib/auth/user";
import {
  getAccessState,
  getPendingOrganizerRequestCount,
} from "@/lib/queries/access";
import { CURRENT_ORG_COOKIE } from "@/lib/org/cookies";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";

export async function Navbar() {
  const [profile, orgs, cookieStore, access] = await Promise.all([
    getProfile(),
    getUserOrgs(),
    cookies(),
    getAccessState(),
  ]);
  const currentOrgId = cookieStore.get(CURRENT_ORG_COOKIE)?.value;
  const pendingRequests = access.isPlatformAdmin
    ? await getPendingOrganizerRequestCount()
    : 0;

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
        <div className="flex items-center gap-3">
          {access.isPlatformAdmin && (
            <Link
              href="/admin/organizer-requests"
              className="text-muted-foreground hover:text-foreground relative text-sm font-medium"
            >
              Admin
              {pendingRequests > 0 && (
                <span className="bg-claret absolute -top-2 -right-3 grid size-4 place-items-center rounded-full text-[10px] font-semibold text-white tabular-nums">
                  {pendingRequests}
                </span>
              )}
            </Link>
          )}
          <UserMenu
            displayName={profile?.display_name ?? null}
            email={profile?.email ?? ""}
            avatarUrl={profile?.avatar_url ?? null}
          />
        </div>
      </div>
    </header>
  );
}
