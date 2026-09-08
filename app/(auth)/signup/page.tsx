import Link from "next/link";

import { SignupForm } from "@/components/auth/signup-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  // Keep the destination attached when they bounce to sign-in instead: someone
  // who already has an account is still mid-registration.
  const signInHref = sp.next
    ? `/login?next=${encodeURIComponent(sp.next)}`
    : "/login";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Run leagues and tournaments, or just show up and play.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm next={sp.next} />
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-muted-foreground text-sm">
          Already have an account?{" "}
          <Link href={signInHref} className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
