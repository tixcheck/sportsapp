import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to your account.</CardDescription>
      </CardHeader>
      <CardContent>
        {sp.error && (
          <p className="text-destructive mb-4 text-sm">{sp.error}</p>
        )}
        <LoginForm next={sp.next} />
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-slate-600">
          New here?{" "}
          <Link href="/signup" className="text-sky-600 hover:underline">
            Create an account
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
