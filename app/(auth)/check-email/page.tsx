import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function CheckEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirm your email</CardTitle>
        <CardDescription>
          We&apos;ve sent you a confirmation link. Click it to verify your
          email, then you&apos;ll be signed in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-600">
          Didn&apos;t get it? Check your spam folder, or{" "}
          <Link href="/signup" className="text-sky-600 hover:underline">
            try again
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
