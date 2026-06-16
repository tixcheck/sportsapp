import { redirect } from "next/navigation";

import { getProfile } from "@/lib/auth/user";
import { ProfileForm } from "@/components/profile/profile-form";
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
    <div className="mx-auto max-w-lg">
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
    </div>
  );
}
