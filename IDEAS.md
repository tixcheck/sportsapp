# IDEAS

Deferred / out-of-current-scope ideas (per CLAUDE.md, ideas land here instead of
being built ad hoc).

## Ladder league — "tiers that teams move between every week"

**Status:** design captured 2026-08-06, not started, **one decision open**.
Full design: [`docs/plans/ladder-league.md`](docs/plans/ladder-league.md).

A box/ladder league: each tier plays among itself weekly, and that night's
results move teams between tiers. Organizer sets tiers + teams per tier, and a
per-team **sets or games** target per night which the app divides across the
night's pairings. Locked: movement on the night's results only; final placing is
where you finish on the ladder. **Blocked on** whether promotion/relegation
counts are symmetric per boundary — asymmetric counts make tier sizes collapse
over a season. Big consequence: the season schedule can no longer be
pre-generated, only the calendar; matchups are drawn week by week.

## AI-powered spreadsheet import — "Upload my existing schedule"

**Status:** planned, deferred to a later phase (parked 2026-06-30). Full approved
design: [`docs/plans/spreadsheet-import.md`](docs/plans/spreadsheet-import.md).

At the schedule step, organizers choose **Generate** (existing) vs **Upload my
existing schedule** — an AI-parsed (Anthropic API) Excel/CSV import of teams,
matchups, times, courts, and already-played scores, behind a **mandatory human
review-and-correct gate** (never commit a parsed schedule blind). Phase 1 scope
(decided with owner): **leagues, with scores**. Phases 2–3 add tournaments,
brackets, PDF, Google Sheets. Serves new-organizer onboarding + the owner's
past-event migration.

## Registration payments — "Collect fees online, pay out to organizers"

**Status:** APPROVED, building (decisions locked 2026-07-30). Full design +
locked decisions: [`docs/plans/registration-payments.md`](docs/plans/registration-payments.md).
Stripe Connect **Express**, **pass-through** fees, platform fee 1% (tournaments)
/ $3 per player or $20 per team (leagues), admin-adjustable. Building in slices
A (payouts onboarding) → B (paid registration) → C (payment management).

Teams pay the registration fee online at registration via **Stripe Connect**;
money routes to the organizer's own bank, minus the platform fee. The win is
**collecting at registration** (kills e-transfer chasing), offered *alongside*
cash/e-transfer, not instead. Covers the fee model (pass-through gross-up so
organizers net their target), payout timing, refunds, and **split payments**
(captain pays all, or everyone pays their share; team confirmed only when the
shares complete). A **v1** feature (PRD §14). Still needed from the owner before
money can move: **Stripe test keys**, then the refund policy + tax stance copy
for go-live.
