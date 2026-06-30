---
name: spreadsheet-import-deferred
description: AI spreadsheet-import feature ("Upload my existing schedule") is planned but deferred to a later phase; full design saved in-repo.
metadata:
  type: project
---

The AI-powered spreadsheet import ("Upload my existing schedule" — Anthropic API
parses an Excel/CSV into teams/matchups/times/courts/scores behind a mandatory
human review gate) was fully planned and **approved but deferred** on 2026-06-30 —
the owner chose to focus elsewhere and revisit next phase.

**Where the design lives:** `docs/plans/spreadsheet-import.md` (full plan, build
order, verification) and a pointer in `IDEAS.md`. Phase 1 scope: **leagues, with
scores**.

**How to apply:** when the owner returns to this, start from that doc's "Suggested
build order" — don't re-plan from scratch. Pairs with [[engine-first-build-order]]
(pure parser + mocked-Anthropic tests first) and [[plan-checkpoint-before-implementing]].
