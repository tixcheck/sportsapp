import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";

import { getLeagueDetail, getLeagueSchedule } from "@/lib/queries/leagues";
import { getOrigin } from "@/lib/utils/url";
import { SPORTS } from "@/lib/formats";
import { cn } from "@/lib/utils";
import { AddTeamForm } from "@/components/league/add-team-form";
import { CopyButton } from "@/components/league/copy-button";
import { GenerateScheduleButton } from "@/components/league/generate-schedule-button";
import { PublishToggle } from "@/components/league/publish-toggle";
import { ScheduleView } from "@/components/schedule/schedule-view";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ orgId: string; leagueId: string }>;
}) {
  const { orgId, leagueId } = await params;
  const league = await getLeagueDetail(leagueId);
  if (!league || league.orgId !== orgId) notFound();
  const [origin, schedule] = await Promise.all([
    getOrigin(),
    getLeagueSchedule(leagueId),
  ]);

  const sportLabel = SPORTS.find((s) => s.value === league.sport)?.label;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/orgs/${orgId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Back to leagues
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
              {league.name}
            </h1>
            <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium capitalize">
              {league.status}
            </span>
          </div>
          <PublishToggle
            competitionId={league.id}
            status={league.status}
            slug={league.slug}
          />
        </div>
        <p className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>{sportLabel}</span>
          {league.startDate && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {league.startDate} → {league.endDate}
            </span>
          )}
          {league.venue && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" />
              {league.venue}
            </span>
          )}
        </p>
      </div>

      {/* Schedule */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>
              {league.matchCount > 0
                ? `${league.matchCount} matches generated.`
                : "No matches yet."}
            </CardDescription>
          </div>
          <GenerateScheduleButton
            competitionId={league.id}
            hasSchedule={league.matchCount > 0}
          />
        </CardHeader>
        {league.teams.length < 2 ? (
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Add at least 2 teams to generate a round-robin schedule.
            </p>
          </CardContent>
        ) : schedule.length > 0 ? (
          <CardContent>
            <ScheduleView
              matches={schedule}
              timezone={league.timezone}
              editable
            />
          </CardContent>
        ) : null}
      </Card>

      {/* Teams */}
      <Card>
        <CardHeader>
          <CardTitle>Teams</CardTitle>
          <CardDescription>
            Add a team with its captain&apos;s email — they get a link to claim
            it and join.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AddTeamForm competitionId={league.id} />

          {league.teams.length > 0 && (
            <ul className="divide-border divide-y">
              {league.teams.map((t) => {
                const claimUrl = t.invite
                  ? `${origin}/claim/${t.invite.token}`
                  : null;
                return (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span className="font-medium">{t.name}</span>
                    <div className="flex items-center gap-3">
                      <StatusTag
                        claimed={!!t.captain_user_id}
                        pending={!!t.invite}
                        email={t.invite?.email}
                      />
                      {claimUrl && (
                        <CopyButton value={claimUrl} label="Copy invite link" />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusTag({
  claimed,
  pending,
  email,
}: {
  claimed: boolean;
  pending: boolean;
  email?: string;
}) {
  const text = claimed
    ? "Captain joined"
    : pending
      ? `Invite pending · ${email}`
      : "No captain";
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium",
        claimed
          ? "bg-accent text-accent-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      {text}
    </span>
  );
}
