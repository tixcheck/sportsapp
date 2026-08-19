import Link from "next/link";
import { redirect } from "next/navigation";

import { getProfile } from "@/lib/auth/user";
import { getPlayerProfile } from "@/lib/queries/player-stats";
import { MyStatsCard } from "@/components/stats/my-stats-card";
import { ProfileForm } from "@/components/profile/profile-form";
import { Button } from "@/components/ui/button";
import { NotificationPrefsForm } from "@/components/profile/notification-prefs-form";
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
  const stats = await getPlayerProfile(profile.id);

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
