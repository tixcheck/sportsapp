import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";

import { getOrg, getOrgLeagues } from "@/lib/queries/leagues";
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
  const leagues = await getOrgLeagues(orgId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
            {org.name}
          </h1>
          <p className="text-muted-foreground text-sm">Leagues</p>
        </div>
        <Button asChild>
          <Link href={`/orgs/${orgId}/leagues/new`}>
            <Plus />
            New league
          </Link>
        </Button>
      </div>

      {leagues.length === 0 ? (
        <div className="border-border bg-surface rounded-lg border p-10 text-center">
          <p className="text-muted-foreground">
            No leagues yet. Create your first one to add teams and generate a
            schedule.
          </p>
          <Button asChild className="mt-4">
            <Link href={`/orgs/${orgId}/leagues/new`}>
              <Plus />
              New league
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leagues.map((l) => (
            <Link key={l.id} href={`/orgs/${orgId}/leagues/${l.id}`}>
              <Card className="hover:border-primary/40 h-full transition-colors">
                <CardHeader>
                  <CardTitle className="truncate">{l.name}</CardTitle>
                  <CardDescription>
                    {SPORTS.find((s) => s.value === l.sport)?.label} ·{" "}
                    <span className="capitalize">{l.status}</span>
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
