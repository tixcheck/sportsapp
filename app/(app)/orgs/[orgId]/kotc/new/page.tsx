import Link from "next/link";
import { notFound } from "next/navigation";

import { getOrg } from "@/lib/queries/leagues";
import { KotcCreateForm } from "@/components/kotc/kotc-create-form";

export default async function NewKotcPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const org = await getOrg(orgId);
  if (!org) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/orgs/${orgId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Back to organization
        </Link>
        <h1 className="font-display text-foreground mt-2 text-2xl font-semibold tracking-tight">
          New King of the Court
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Beach 2s. Seeding rounds → fair re-pool → elimination.
        </p>
      </div>
      <KotcCreateForm orgId={orgId} />
    </div>
  );
}
