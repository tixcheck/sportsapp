---
name: kotc-format-planned
description: King of the Court (beach 2s) competition format is fully planned and approved but NOT built; full design is in KOTC.md.
metadata:
  type: project
---

A configurable **King of the Court** format for beach 2s (based on
kingofthecourt.com) was fully planned and **approved on 2026-06-30 but not built**.

**Design lives in `KOTC.md`** (repo root). Key decisions: a **new
`competition_type 'kotc'`** (leaves league/tournament/pools/bracket/matches/sets
untouched); KotC-only tables incl. an append-only `kotc_events` rally log; a pure
state machine in `lib/kotc/`; a 3-level tiebreaker (total King points → longest
King-side streak → reached-the-total-first) that **requires** the event log; a fair
re-pool algorithm (balance strength + minimize rematches); a normalized-placement
seed metric; snake elimination seeding; and a client-side optimistic live scoreboard
(no realtime infra exists). **Phase 1** = schema + seeding/re-pool/elimination logic
+ manual per-round score entry; **Phase 2** = live rally-tap engine (activates the
reached-first tiebreaker).

**How to apply:** when building, follow KOTC.md's Phase 1 + the engine-first order;
don't re-plan. Pairs with [[engine-first-build-order]], [[plans-as-repo-files]],
[[domain-regression-surface-tradeoff]].
