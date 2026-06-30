---
name: plans-as-repo-files
description: The user reads plans as named markdown files in the repo, not terminal output — when asked to write a plan to a file (e.g. KOTC.md), write it there directly.
metadata:
  type: feedback
---

When the user asks for a plan/design to be written to a named file (e.g. `KOTC.md`,
`docs/plans/*.md`), produce that repo markdown file directly — they read plans as
proper files, **not** scrolled-back terminal output, and find the terminal version
hard to read.

**Why:** stated explicitly more than once ("write it to KOTC.md so i can read it
properly and not in the terminal"); plan-mode ceremony that blocks the file write
frustrates them.

**How to apply:** if a request says "write the plan to <file>", treat the file as the
deliverable and write it. Don't get stuck cycling ExitPlanMode when the user just
wants the markdown file. Pairs with [[plan-checkpoint-before-implementing]] and
[[engine-first-build-order]].
