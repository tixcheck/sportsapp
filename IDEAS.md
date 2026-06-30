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
