# IDEAS

Deferred / out-of-current-scope ideas (per CLAUDE.md, ideas land here instead of
being built ad hoc).

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

**Status:** planned, not started (documented 2026-07-23). Full design:
[`docs/plans/registration-payments.md`](docs/plans/registration-payments.md).

Teams pay the registration fee online at registration via **Stripe Connect**;
money routes to the organizer's own bank, with an optional $1–2 platform fee.
The win is **collecting at registration** (kills e-transfer chasing), offered
*alongside* cash/e-transfer, not instead. Covers the fee model (pass-through
gross-up so organizers net their target), payout timing, refunds, and a
test-mode Phase 1 slice. A **v1** feature (PRD §14). The plan doc lists exactly
what the owner must provide to proceed (Stripe account + keys, fee/refund/account-
type decisions, tax stance).
