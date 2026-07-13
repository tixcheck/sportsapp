import { DateTime } from "luxon";

/**
 * Whether a competition's last scheduled day has fully passed in its venue
 * timezone — the gate for letting an organizer mark it completed. With no end
 * date to check against, there's nothing to gate on, so it's allowed.
 */
export function endDatePassed(
  endDate: string | null,
  timezone: string,
): boolean {
  if (!endDate) return true;
  const lastMoment = DateTime.fromISO(endDate, { zone: timezone }).endOf("day");
  return DateTime.now().setZone(timezone) > lastMoment;
}
