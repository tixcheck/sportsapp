"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type AdminTabCounts = {
  organizerRequests: number;
  supportWaiting: number;
  reviewsPending: number;
};

/**
 * The platform admin's sections, each with what's waiting on him. The navbar
 * badge is one number for all three; the owner couldn't tell which it meant
 * (2026-10-20), so each tab says its own, in words.
 */
export function AdminTabs({ counts }: { counts: AdminTabCounts }) {
  const path = usePathname();
  const tabs = [
    { href: "/admin", label: "Overview", count: 0, note: "" },
    {
      href: "/admin/organizer-requests",
      label: "Organizer requests",
      count: counts.organizerRequests,
      note: "new",
    },
    {
      href: "/admin/support",
      label: "Support",
      count: counts.supportWaiting,
      note: "waiting",
    },
    {
      href: "/admin/reviews",
      label: "Reviews",
      count: counts.reviewsPending,
      note: "to approve",
    },
  ];
  const active = (href: string) =>
    href === "/admin" ? path === "/admin" : path.startsWith(href);

  return (
    <nav className="-mx-1 mb-6 overflow-x-auto px-1 pb-1">
      <ul className="bg-muted inline-flex min-w-max gap-1 rounded-lg p-1">
        {tabs.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={active(t.href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm whitespace-nowrap",
                active(t.href)
                  ? "bg-surface text-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.count > 0 && (
                <span className="bg-claret rounded-full px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">
                  {t.count} {t.note}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
