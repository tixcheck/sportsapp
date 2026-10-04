import Link from "next/link";
import { redirect } from "next/navigation";

import { getProfile } from "@/lib/auth/user";
import { getPlayerProfile } from "@/lib/queries/player-stats";
import { MyStatsCard } from "@/components/stats/my-stats-card";
import { ProfileForm } from "@/components/profile/profile-form";
import { Button } from "@/components/ui/button";
import { NotificationPrefsForm } from "@/components/profile/notification-prefs-form";
import { PlayerDetailsForm } from "@/components/registration/player-details-form";
import { getMyLeagueDetails } from "@/lib/queries/my-league-details";
import { addressAutocompleteAvailableAction } from "@/server/actions/places";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ProfilePage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const [stats, leagueDetails, addressAutocomplete] = await Promise.all([
    getPlayerProfile(profile.id),
    getMyLeagueDetails(),
    addressAutocompleteAvailableAction(),
  ]);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>How you appear across the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            email={profile.email}
            defaultValues={{
              displayName: profile.display_name ?? "",
              avatarUrl: profile.avatar_url ?? "",
            }}
          />
        </CardContent>
      </Card>

      {/* What each league asked — address, gender, full name. Players look
          for these under Profile ("I don't know where I can edit these
          details"), and once the dashboard prompt is complete it goes away. */}
      {leagueDetails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>League details</CardTitle>
            <CardDescription>
              What your leagues asked when you signed up. Only that
              league&apos;s organizer sees your answers — keep them current.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {leagueDetails.map((d) => (
              <PlayerDetailsForm
                key={d.competitionId}
                competitionId={d.competitionId}
                competitionName={d.name}
                organizerName={d.orgName}
                questions={d.questions}
                initial={d.answers}
                suggested={d.suggested}
                addressAutocomplete={addressAutocomplete}
                context="profile"
              />
            ))}
          </CardContent>
        </Card>
      )}

      {stats && <MyStatsCard profile={stats} />}

      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>
            Registration fees you&apos;ve paid by card.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/profile/payments">View your payments</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Choose which emails you receive.</CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationPrefsForm
            initial={{
              notifyResults: profile.notify_results,
              notifyScheduleChanges: profile.notify_schedule_changes,
              notifyWeekly: profile.notify_weekly,
              notifyOrgMessages: profile.notify_org_messages,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
