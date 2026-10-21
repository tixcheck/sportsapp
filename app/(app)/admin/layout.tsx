import type { ReactNode } from "react";

import { getAccessState } from "@/lib/queries/access";
import { getAdminTabCounts } from "@/lib/queries/support";
import { AdminTabs } from "@/components/admin/admin-tabs";

/** Every admin page opens under the same tabs, each saying what's waiting. */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Each page still guards itself with notFound(); this only skips the tabs.
  const access = await getAccessState();
  if (!access.isPlatformAdmin) return children;
  const counts = await getAdminTabCounts();
  return (
    <div>
      <div className="mx-auto max-w-4xl">
        <AdminTabs counts={counts} />
      </div>
      {children}
    </div>
  );
}
