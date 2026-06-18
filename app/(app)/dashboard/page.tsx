import Link from "next/link";
import { Plus } from "lucide-react";

import { getUserOrgs } from "@/lib/auth/user";
import {
  competitionPath,
  getMyCompetitions,
  getMyPendingInvites,
  type MyCompetition,
} from "@/lib/queries/dashboard";
import { getAccessState } from "@/lib/queries/access";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PendingInviteCard } from "@/components/dashboard/pending-invite-card";
import { InviteTeammateDialog } from "@/components/team/invite-teammate-dialog";
import { BecomeOrganizer } from "@/components/dashboard/become-organizer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function nextMatchLine(c: MyCompetition): string | null {
  const m = c.nextMatch;
  if (!m) return null;
  const opponent =
    m.homeName === c.teamName ? m.awayName : (m.homeName ?? m.awayName);
  const parts = [opponent ? `vs ${opponent}` : "TBD"];
  if (m.round) parts.push(`Round ${m.round}`);
  if (m.court) parts.push(m.court);
  return parts.join(" · ");
}

export default async function DashboardPage() {
  const [orgs, comps, invites, access] = await Promise.all([
    getUserOrgs(),
    getMyCompetitions(),
    getMyPendingInvites(),
    getAccessState(),
  ]);
  const canCreateOrg = access.organizerStatus === "approved";

  return (
    <div className="space-y-10">
      {invites.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">
            Pending invites
          </h2>
          <div className="space-y-3">
            {invites.map((inv) => (
              <PendingInviteCard
                key={inv.inviteId}
                invite={inv}
                role={inv.role}
              />
            ))}
          </div>
        </section>
      )}

      {comps.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">
            Competitions you play in
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {comps.map((c) => {
              const next = nextMatchLine(c);
              return (
                <Card
                  key={`${c.competitionId}:${c.teamId}`}
                  className="flex h-full flex-col"
                >
                  <CardHeader>
                    <CardTitle className="truncate">
                      <Link
                        href={competitionPath(c.type, c.slug)}
                        className="hover:underline"
                      >
                        {c.name}
                      </Link>
                    </CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate">{c.teamName}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          c.teamStatus === "withdrawn"
                            ? "bg-gold-300/40 text-coral-900"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {c.teamStatus === "withdrawn"
                          ? "Withdrawn"
                          : c.memberRole}
                      </span>
                    </CardDescription>
                    {next && (
                      <p className="text-muted-foreground mt-1 truncate text-sm">
                        Next: {next}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="mt-auto flex flex-wrap items-center gap-2 pt-0">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/teams/${c.teamId}`}>My team</Link>
                    </Button>
                    {c.memberRole === "captain" &&
                      c.teamStatus !== "withdrawn" && (
                        <InviteTeammateDialog
                          teamId={c.teamId}
                          teamName={c.teamName}
                        />
                      )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {canCreateOrg ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">
                Your organizations
              </h2>
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

          {orgs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Create your first organization to run a league or tournament.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {orgs.map((org) => (
                <Link key={org.id} href={`/orgs/${org.id}`}>
                  <Card className="hover:border-primary/40 h-full transition-colors">
                    <CardHeader>
                      <CardTitle className="truncate">{org.name}</CardTitle>
                      <CardDescription>
                        /{org.slug} · {org.role}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">
            Organizer access
          </h2>
          <BecomeOrganizer status={access.organizerStatus} />
          {invites.length === 0 && comps.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Or ask your organizer to add you to a team — you&apos;ll see your
              competitions here.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
