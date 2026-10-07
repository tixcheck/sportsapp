import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Permit, PermitDate, PermitStatus } from "@/lib/venues/permits";

export type OrgPermits = { permits: Permit[]; dates: PermitDate[] };

/**
 * An organization's gym permits and their date exceptions (0155). Members
 * only, by RLS — anyone else gets empty lists.
 */
export async function getOrgPermits(orgId: string): Promise<OrgPermits> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("venue_permits")
    .select(
      "id, venue_id, day_of_week, label, courts, court_labels, start_time, end_time, starts_on, ends_on, venues(name)",
    )
    .eq("org_id", orgId)
    .order("day_of_week")
    .order("start_time");
  const permits: Permit[] = (
    (rows ?? []) as unknown as {
      id: string;
      venue_id: string;
      day_of_week: number;
      label: string | null;
      courts: number;
      court_labels: string[] | null;
      start_time: string;
      end_time: string;
      starts_on: string;
      ends_on: string;
      venues: { name: string } | null;
    }[]
  ).map((r) => ({
    id: r.id,
    venueId: r.venue_id,
    venueName: r.venues?.name ?? "Gym",
    dayOfWeek: r.day_of_week,
    label: r.label,
    courts: r.courts,
    courtLabels: r.court_labels,
    startTime: r.start_time,
    endTime: r.end_time,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
  }));
  if (permits.length === 0) return { permits, dates: [] };

  const { data: dateRows } = await supabase
    .from("venue_permit_dates")
    .select("permit_id, on_date, status, start_time, end_time, note")
    .in(
      "permit_id",
      permits.map((p) => p.id),
    )
    .order("on_date");
  const dates: PermitDate[] = (
    (dateRows ?? []) as {
      permit_id: string;
      on_date: string;
      status: PermitStatus;
      start_time: string | null;
      end_time: string | null;
      note: string | null;
    }[]
  ).map((d) => ({
    permitId: d.permit_id,
    onDate: d.on_date,
    status: d.status,
    startTime: d.start_time,
    endTime: d.end_time,
    note: d.note,
  }));
  return { permits, dates };
}
