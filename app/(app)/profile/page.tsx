import { redirect } from "next/navigation";

import { getProfile } from "@/lib/auth/user";
import { ProfileForm } from "@/components/profile/profile-form";
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
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
