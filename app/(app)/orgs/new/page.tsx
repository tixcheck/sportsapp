import Link from "next/link";

import { CreateOrgForm } from "@/components/org/create-org-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NewOrgPage() {
  return (
    <div className="mx-auto max-w-lg">
      <Link
        href="/dashboard"
        className="text-muted-foreground text-sm hover:underline"
      >
        ← Back to dashboard
      </Link>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>New organization</CardTitle>
          <CardDescription>
            An organization owns your leagues and tournaments. You&apos;ll be
            its owner.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrgForm />
        </CardContent>
      </Card>
    </div>
  );
}
