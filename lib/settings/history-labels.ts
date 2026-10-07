import { DateTime } from "luxon";

/**
 * Turning a `settings_changes` row (0154) into a line an organizer can read:
 * "Registration deadline · Sat Oct 3 → Sat Oct 10". Pure.
 *
 * Values arrive as JSON exactly as the column held them: timestamps as ISO
 * strings, money in cents, booleans, numbers, arrays. Anything this doesn't
 * know how to say is shown as plain text rather than hidden — an odd-looking
 * line beats a missing one in a history.
 */

const LABELS: Record<string, string> = {
  registration_open: "Registration",
  registration_deadline: "Registration deadline",
  max_teams: "Maximum teams",
  max_pairs: "Maximum pairs",
  blackout_dates: "Skipped dates",
  weekly_slots: "Weekly night",
  tiebreaker: "Tiebreaker",
  ladder_swaps: "Ladder movement",
  wave_swap_weeks: "Swap early/late tiers every",
  session_nights: "Session nights",
  pool_size: "Pool size",
  bracket_type: "Bracket",
  playoff_teams: "Playoff teams",
  courts: "Courts",
  rounds: "Rounds",
  minutes_per_game: "Minutes per game",
  point_cap: "Point cap",
  registration_fee_cents: "Registration fee",
  individual_fee_cents: "Individual fee",
  payment_required: "Payment required",
  allow_captain_pays: "Captain can pay for the team",
  allow_split_payment: "Players can split the fee",
  tax_enabled: "Tax",
  tax_percent: "Tax rate",
  etransfer_email: "E-transfer email",
  paypal_team_url: "PayPal link (teams)",
  paypal_individual_url: "PayPal link (individuals)",
  name: "Name",
  status: "Status",
  visibility: "Visibility",
  start_date: "Start date",
  end_date: "End date",
  venue: "Venue",
  waiver_id: "Waiver",
  min_roster_for_entry: "Minimum roster",
  allow_individual_signups: "Individual sign-ups",
  max_individual_signups: "Maximum individuals",
  platform_fee_waived: "Platform fee waived",
};

export function fieldLabel(field: string): string {
  return LABELS[field] ?? field.replace(/_/g, " ");
}

export function formatSettingValue(
  field: string,
  value: unknown,
  timezone: string,
): string {
  if (value === null || value === undefined || value === "") return "none";
  if (field === "registration_open" || field === "allow_individual_signups") {
    return value ? "open" : "closed";
  }
  if (typeof value === "boolean") return value ? "on" : "off";
  if (field.endsWith("_cents") && typeof value === "number") {
    return `$${(value / 100).toFixed(2)}`;
  }
  if (field === "tax_percent" && typeof value === "number") return `${value}%`;
  if (field === "wave_swap_weeks" && typeof value === "number") {
    return `${value} week${value === 1 ? "" : "s"}`;
  }
  if (field === "waiver_id") return "a waiver";
  if (typeof value === "string") {
    // Timestamps (deadlines) read in the league's own time, to the minute.
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const dt = DateTime.fromISO(value, { zone: timezone });
      if (dt.isValid) return dt.toFormat("ccc LLL d, h:mm a");
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const dt = DateTime.fromISO(value, { zone: timezone });
      if (dt.isValid) return dt.toFormat("ccc LLL d");
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "none";
    if (
      value.every((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))
    ) {
      return value
        .map((v) => DateTime.fromISO(v as string).toFormat("LLL d"))
        .join(", ");
    }
    return value
      .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))
      .join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function describeChange(
  row: { field: string; oldValue: unknown; newValue: unknown },
  timezone: string,
): string {
  if (row.field === "waiver_id") {
    return row.newValue ? "Waiver required" : "Waiver removed";
  }
  return `${fieldLabel(row.field)}: ${formatSettingValue(row.field, row.oldValue, timezone)} → ${formatSettingValue(row.field, row.newValue, timezone)}`;
}
