---
name: engine-first-build-order
description: For scheduler/core logic, build pure functions + full tests first, prove them passing and commit separately, before integration or UI. Don't push until the user verifies.
metadata:
  type: feedback
---

For non-trivial core/engine work (esp. `lib/scheduler/` pure functions), build and
fully unit-test the pure functions FIRST, show them passing, and commit the engine
as its own commit — BEFORE refactoring the integration points (e.g.
`layoutPoolSchedule`, server actions) or adding UI.

**Why:** isolates correctness of the hard part, keeps commits reviewable, and lets
the user verify the engine before it's wired in.

**How to apply:** sequence = pure fns + tests → (pause, show green) → integration →
UI. Separate commits per stage. Do NOT push until the user verifies. Pairs with
[[plan-checkpoint-before-implementing]] and [[domain-regression-surface-tradeoff]].
