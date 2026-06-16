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
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold tracking-tight text-slate-900"
          >
            <span className="grid size-6 place-items-center rounded-md bg-sky-500 text-xs text-white">
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
