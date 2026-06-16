import Link from "next/link";
import { Plus } from "lucide-react";

import { getUserOrgs } from "@/lib/auth/user";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const orgs = await getUserOrgs();

  if (orgs.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
          Welcome 👋
        </h1>
        <p className="text-muted-foreground mt-2">
          Create your organization to start running leagues and tournaments.
        </p>
        <Button asChild className="mt-6">
          <Link href="/orgs/new">
            <Plus />
            Create organization
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
            Your organizations
          </h1>
          <p className="text-muted-foreground text-sm">
            Leagues and tournaments live inside an organization.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/orgs/new">
            <Plus />
            New
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orgs.map((org) => (
          <Card key={org.id}>
            <CardHeader>
              <CardTitle className="truncate">{org.name}</CardTitle>
              <CardDescription>
                /{org.slug} · {org.role}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
