import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";

import { getUser } from "@/lib/auth/user";
import { getMyPayments, type MyPayment } from "@/lib/queries/payments";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Payments" };

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD" });

const STATUS: Record<
  MyPayment["status"],
  { label: string; tone: string; note: string }
> = {
  paid: {
    label: "Paid",
    tone: "bg-emerald-100 text-emerald-800",
    note: "Stripe emailed your receipt when this went through.",
  },
  pending: {
    label: "Unfinished",
    tone: "bg-amber-100 text-amber-800",
    note: "You started this payment but didn't finish it.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "bg-paper-sunken text-ink-2",
    note: "This payment link expired without being paid.",
  },
  refunded: {
    label: "Refunded",
    tone: "bg-paper-sunken text-ink-2",
    note: "The organizer refunded this payment.",
  },
};

function competitionPath(type: MyPayment["competitionType"], slug: string) {
  if (!slug) return null;
  return type === "league" ? `/l/${slug}` : `/t/${slug}`;
}

export default async function MyPaymentsPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/profile/payments");

  const payments = await getMyPayments();
  const paidTotal = payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.totalCents, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/profile"
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Profile
        </Link>
        <h1 className="font-display text-foreground mt-1 text-2xl font-semibold tracking-tight">
          Payments
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Registration fees you&apos;ve paid, and any you started but
          didn&apos;t finish.
        </p>
      </div>

      {payments.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing here yet</CardTitle>
            <CardDescription>
              When you pay a registration fee by card, it shows up here with the
              amount and the date.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard">Back to your events</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {paidTotal > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Paid in total</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {money(paidTotal)}
                </CardTitle>
              </CardHeader>
            </Card>
          )}

          <ul className="space-y-3">
            {payments.map((p) => {
              const s = STATUS[p.status];
              const when = p.paidAt ?? p.createdAt;
              const href = competitionPath(
                p.competitionType,
                p.competitionSlug,
              );

              return (
                <li key={p.id}>
                  <Card>
                    <CardContent className="space-y-3 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {p.competitionName}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            {p.teamName} ·{" "}
                            {p.kind === "team_full"
                              ? "whole team fee"
                              : "your share"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold tabular-nums">
                            {money(p.totalCents)}
                          </p>
                          <span
                            className={`inline-block rounded-[4px] px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${s.tone}`}
                          >
                            {s.label}
                          </span>
                        </div>
                      </div>

                      <dl className="text-muted-foreground grid gap-1 text-xs tabular-nums">
                        <div className="flex justify-between">
                          <dt>{p.status === "paid" ? "Paid" : "Started"}</dt>
                          <dd>
                            {DateTime.fromISO(when).toFormat("LLL d, yyyy")}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Went to the organizer</dt>
                          <dd>{money(p.priceCents + p.taxCents)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Card and platform fees</dt>
                          <dd>
                            {money(p.totalCents - p.priceCents - p.taxCents)}
                          </dd>
                        </div>
                      </dl>

                      <p className="text-muted-foreground text-xs">{s.note}</p>

                      <div className="flex flex-wrap gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/teams/${p.teamId}`}>View team</Link>
                        </Button>
                        {href && (
                          <Button asChild size="sm" variant="outline">
                            <Link href={href}>View event</Link>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
