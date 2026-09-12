"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type OrganizerTab = {
  value: string;
  label: string;
  content: ReactNode;
};

/**
 * Tabbed sections for an organizer competition page (league or tournament) —
 * schedule / standings / teams / settings … — so the page reads as clickable
 * tabs instead of one long scroll. Server-rendered section content is passed in
 * as `content` nodes; only the tab switching is client-side. The tab bar scrolls
 * horizontally on narrow screens.
 */
export function OrganizerTabs({
  tabs,
  defaultValue,
  variant = "primary",
}: {
  tabs: OrganizerTab[];
  /** Tab open on load; falls back to the first tab. */
  defaultValue?: string;
  /**
   * "nested" for a second bar INSIDE a tab — smaller, and less contrast than
   * the page's own tabs. Two identical bars stacked read as one broken bar;
   * the inner one has to look subordinate to the outer one or neither is
   * legible.
   */
  variant?: "primary" | "nested";
}) {
  if (tabs.length === 0) return null;
  const initial =
    defaultValue && tabs.some((t) => t.value === defaultValue)
      ? defaultValue
      : tabs[0].value;
  return (
    <Tabs defaultValue={initial}>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList className={variant === "nested" ? "h-8 gap-0.5" : undefined}>
          {tabs.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className={variant === "nested" ? "text-xs" : undefined}
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((t) => (
        <TabsContent
          key={t.value}
          value={t.value}
          className={variant === "nested" ? "mt-4" : "mt-6"}
        >
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
