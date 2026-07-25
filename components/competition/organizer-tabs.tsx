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
}: {
  tabs: OrganizerTab[];
  /** Tab open on load; falls back to the first tab. */
  defaultValue?: string;
}) {
  if (tabs.length === 0) return null;
  const initial =
    defaultValue && tabs.some((t) => t.value === defaultValue)
      ? defaultValue
      : tabs[0].value;
  return (
    <Tabs defaultValue={initial}>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-6">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
