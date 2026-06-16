---
name: plan-checkpoint-before-implementing
description: For each build phase, the user wants a plan + ambiguity checkpoint before code is written
metadata:
  type: feedback
---

For the sportsapp/volleyball-platform build (driven phase-by-phase from PRD.md
Section 12), the user wants, before any code on a substantive task: a short
bulleted plan, the concrete artifacts to be created (e.g. the list of enums),
and explicit flagging of ambiguities in the spec — resolved *before* running
anything irreversible (migrations, etc.), not after.

**Why:** They are executing the PRD in deliberate vertical slices and review
each phase before committing; surfacing schema/decision forks up front avoids
costly rework once a migration has run.

**How to apply:** At the start of a phase, present plan + decisions + open
questions and pause for confirmation (AskUserQuestion is fine). Then implement,
verify, and stop at the phase boundary for their review/commit — do not roll
into the next phase. Each phase ends with: tests/typecheck/lint clean, then stop.
