import Link from "next/link";
import { notFound } from "next/navigation";

import { getAccessState } from "@/lib/queries/access";
import {
  getAllOrgsWithCompetitions,
  type AdminCompetition,
} from "@/lib/queries/admin";
import { AdminCompetitionRow } from "@/components/admin/competition-row";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function AdminOverviewPage() {
  // Platform-admin only. RLS also enforces the underlying reads; this guards the
  // page itself.
  const access = await getAccessState();
  if (!access.isPlatformAdmin) notFound();

  const orgs = await getAllOrgsWithCompetitions();
  const totalComps = orgs.reduce((n, o) => n + o.competitions.length, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
          Platform overview
        </h1>
        <p className="text-muted-foreground text-sm">
          Every organization and the competitions they&apos;re running. Open any
          one to inspect or correct it. {orgs.length} org
          {orgs.length === 1 ? "" : "s"} · {totalComps} competition
          {totalComps === 1 ? "" : "s"}.
        </p>
      </div>

      {orgs.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            No organizations yet.
          </CardContent>
        </Card>
      ) : (
        orgs.map((org) => {
          // Running and finished apart: finished events pile up and push the
          // ones that need attention down the page.
          const open = org.competitions.filter((c) => c.status !== "completed");
          const done = org.competitions.filter((c) => c.status === "completed");
          return (
            <section key={org.id} className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-semibold">
                  <Link href={`/orgs/${org.id}`} className="hover:underline">
                    {org.name}
                  </Link>
                </h2>
                <span className="text-muted-foreground text-xs">
                  {org.owner ?? "no owner"}
                </span>
              </div>
              <CompetitionGroup
                title="Open"
                orgId={org.id}
                items={open}
                empty={
                  org.competitions.length === 0
                    ? "Nothing created yet."
                    : "Nothing running right now."
                }
              />
              {done.length > 0 && (
                <CompetitionGroup
                  title="Completed"
                  orgId={org.id}
                  items={done}
                />
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

function CompetitionGroup({
  title,
  orgId,
  items,
  empty,
}: {
  title: string;
  orgId: string;
  items: AdminCompetition[];
  empty?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          {items.length} competition{items.length === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          <ul className="divide-border divide-y">
            {items.map((c) => (
              <AdminCompetitionRow key={c.id} orgId={orgId} c={c} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
