---
name: domain-regression-surface-tradeoff
description: When a change regresses a domain feature guarded by a test, stop and surface the explicit tradeoff — never silently relax the test.
metadata:
  type: feedback
---

If implementing a change would regress a real domain feature that an existing
test guards (e.g. the volleyball reffing-crossover rule in the pool scheduler),
do NOT silently weaken or relax the test to make it pass.

**Why:** the test encodes a real product behavior, not just an assertion. Quietly
relaxing it hides a product regression behind a green suite.

**How to apply:** stop, quantify the tradeoff (how much the feature degrades vs.
what is gained), and present it so the user can consciously accept or reject it.
Only change the test after they decide. Related: [[engine-first-build-order]],
[[plan-checkpoint-before-implementing]].
