import Link from "next/link";
import { notFound } from "next/navigation";

import { getAccessState } from "@/lib/queries/access";
import { getAllOrgsWithCompetitions } from "@/lib/queries/admin";
import { PlatformFeeToggle } from "@/components/admin/platform-fee-toggle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SEGMENT: Record<string, string> = {
  league: "leagues",
  tournament: "tournaments",
  kotc: "kotc",
  reverse_pairs: "reverse-pairs",
};

const TYPE_LABEL: Record<string, string> = {
  league: "League",
  tournament: "Tournament",
  kotc: "KotC",
  reverse_pairs: "Reverse Pairs",
};

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
        <div className="mt-1 flex flex-wrap gap-4">
          <Link
            href="/admin/organizer-requests"
            className="text-primary inline-block text-sm hover:underline"
          >
            Organizer requests →
          </Link>
          <Link
            href="/admin/reviews"
            className="text-primary inline-block text-sm hover:underline"
          >
            Reviews →
          </Link>
        </div>
      </div>

      {orgs.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            No organizations yet.
          </CardContent>
        </Card>
      ) : (
        orgs.map((org) => (
          <Card key={org.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  <Link href={`/orgs/${org.id}`} className="hover:underline">
                    {org.name}
                  </Link>
                </CardTitle>
                <span className="text-muted-foreground text-xs">
                  {org.owner ?? "no owner"}
                </span>
              </div>
              <CardDescription>
                {org.competitions.length} competition
                {org.competitions.length === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {org.competitions.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nothing created yet.
                </p>
              ) : (
                <ul className="divide-border divide-y">
                  {org.competitions.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/orgs/${org.id}/${SEGMENT[c.type]}/${c.id}`}
                          className="font-medium hover:underline"
                        >
                          {c.name}
                        </Link>
                        <span className="text-muted-foreground ml-2 text-xs">
                          {TYPE_LABEL[c.type] ?? c.type} · {c.sport} ·{" "}
                          {c.teamCount} team{c.teamCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <PlatformFeeToggle
                          competitionId={c.id}
                          waived={c.platformFeeWaived}
                        />
                        {c.visibility !== "public" && (
                          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                            {c.visibility}
                          </span>
                        )}
                        <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-medium capitalize">
                          {c.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
