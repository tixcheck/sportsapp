/**
 * Which schedule views to offer (By round, By date, By tier, …).
 *
 * A league can name its own (`league_settings.schedule_views`, 0158) — Mango
 * Coed shows only By tier and By court. Without a choice the schedule offers
 * what it always did: round, date, tier and team for everyone, plus court and
 * the matrix for the organizer.
 */
export const SCHEDULE_VIEWS = [
  "round",
  "date",
  "tier",
  "team",
  "court",
  "matrix",
] as const;
export type ScheduleViewKey = (typeof SCHEDULE_VIEWS)[number];

export const SCHEDULE_VIEW_LABELS: Record<ScheduleViewKey, string> = {
  round: "By round",
  date: "By date",
  tier: "By tier",
  team: "By team",
  court: "By court",
  matrix: "Matrix",
};

const ORGANIZER_ONLY = new Set<ScheduleViewKey>(["court", "matrix"]);

export function isScheduleViewKey(v: unknown): v is ScheduleViewKey {
  return (SCHEDULE_VIEWS as readonly unknown[]).includes(v);
}

/**
 * The views to show, in order; the first is the one the schedule opens on.
 *
 * A chosen list is shown to everyone, organizer-only views included — the
 * organizer picked them. Views that don't apply (By date on a one-night
 * schedule, By tier with one tier) drop out; if that leaves nothing, By round,
 * which always applies.
 */
export function scheduleViewsFor(
  chosen: readonly string[] | null | undefined,
  ctx: { editable: boolean; multiDay: boolean; hasTiers: boolean },
): ScheduleViewKey[] {
  const applies = (v: ScheduleViewKey) =>
    (v !== "date" || ctx.multiDay) && (v !== "tier" || ctx.hasTiers);
  const picked = (chosen ?? []).filter(isScheduleViewKey);
  const views =
    picked.length > 0
      ? [...new Set(picked)].filter(applies)
      : SCHEDULE_VIEWS.filter(
          (v) => applies(v) && (ctx.editable || !ORGANIZER_ONLY.has(v)),
        );
  return views.length > 0 ? views : ["round"];
}
