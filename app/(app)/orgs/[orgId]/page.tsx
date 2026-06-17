import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";

import {
  getOrg,
  getOrgLeagues,
  type LeagueSummary,
} from "@/lib/queries/leagues";
import {
  getOrgTournaments,
  type TournamentSummary,
} from "@/lib/queries/tournaments";
import { SPORTS } from "@/lib/formats";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function OrgPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const org = await getOrg(orgId);
  if (!org) notFound();
  const [leagues, tournaments] = await Promise.all([
    getOrgLeagues(orgId),
    getOrgTournaments(orgId),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
          {org.name}
        </h1>
      </div>

      <Section
        title="Leagues"
        newHref={`/orgs/${orgId}/leagues/new`}
        newLabel="New league"
        emptyText="No leagues yet. Create one to add teams and generate a schedule."
        items={leagues}
        hrefFor={(c) => `/orgs/${orgId}/leagues/${c.id}`}
      />

      <Section
        title="Tournaments"
        newHref={`/orgs/${orgId}/tournaments/new`}
        newLabel="New tournament"
        emptyText="No tournaments yet. Create one and open registration."
        items={tournaments}
        hrefFor={(c) => `/orgs/${orgId}/tournaments/${c.id}`}
      />
    </div>
  );
}

function Section({
  title,
  newHref,
  newLabel,
  emptyText,
  items,
  hrefFor,
}: {
  title: string;
  newHref: string;
  newLabel: string;
  emptyText: string;
  items: (LeagueSummary | TournamentSummary)[];
  hrefFor: (c: LeagueSummary | TournamentSummary) => string;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <Button asChild variant="outline" size="sm">
          <Link href={newHref}>
            <Plus />
            {newLabel}
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="border-border bg-surface text-muted-foreground rounded-lg border p-8 text-center text-sm">
          {emptyText}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <Link key={c.id} href={hrefFor(c)}>
              <Card className="hover:border-primary/40 h-full transition-colors">
                <CardHeader>
                  <CardTitle className="truncate">{c.name}</CardTitle>
                  <CardDescription>
                    {SPORTS.find((s) => s.value === c.sport)?.label} ·{" "}
                    <span className="capitalize">{c.status}</span>
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
