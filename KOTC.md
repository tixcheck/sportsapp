# King of the Court (KotC) — beach 2s competition format

> Status: **PLAN ONLY** (not built). Design for an AI-scored, configurable King of
> the Court format based on kingofthecourt.com rules.

## Context

A new competition format for beach 2s, based on kingofthecourt.com rules but fully
configurable. Two layers:

- **Gameplay:** N pairs (default 5) play continuously on one court — King side vs
  serving/challenger side. Win as challenger → move to King side (no point); win as
  King → score a point, new challenger rotates in; the beaten side goes to the back
  of the queue. Played in timed rounds (default 3×15 min; round count/duration/point
  cap/pairs-per-pool all configurable). Live scoring: a scorekeeper taps each rally
  winner; the system manages King side, the rotation queue, and the round clock.
- **Tournament structure on top (16 pairs example, all configurable):** Round 1 =
  organizer manually assigns pairs into pools, each plays a KotC session to
  completion. Round 2 = app **re-pools** everyone (balance pool strength from R1 +
  minimize rematches), play again. These two are **seeding rounds, no elimination**.
  Then compute an **overall seed** from combined R1+R2. Then app auto-seeds pairs
  into **elimination pools** (snake; organizer tweaks before lock); pools fixed,
  play proceeds to a winner.

This must coexist with the existing league/tournament/pool/bracket + matches/sets
model **without breaking it** — KotC has no fixed matchups or sets.

## Architecture decision — new competition type, not a tournament sub-format

Add **`'kotc'` to the `competition_type` enum** (third type beside `league` /
`tournament`), beach2-only in v0. Rationale: KotC's gameplay (continuous rotation,
no `matches`/`sets`) and structure (seeding rounds → re-pool → elimination, which the
current pools→bracket model can't express) are both fundamentally different. A new
type gets its own settings, tables, creation path, and detail-page rendering, and
leaves `generatePoolsAction`, brackets, `matches`/`sets`, and `lib/standings` /
`tiebreakers` **entirely untouched**. (A `format_template` inside `tournament` would
entangle KotC with `tournament_settings`/pool/bracket gating — rejected.) Reuses
`competitions`, `teams` (a "pair" = a beach2 team), `organizations`, and the RLS
helpers `is_competition_admin` / `can_view_competition`.

---

## 1. Data model (new tables; nothing jammed into matches/sets)

All KotC-specific. Migration via `npm run db:generate` + a hand-written RLS `.sql`
(mirror `lib/db/migrations/0029_co_organizers.sql`): each table gets
`enable row level security` + select via `can_view_competition`, insert/update via
`is_competition_admin`.

- **`kotc_settings`** (1:1 competition) — gameplay + structure config:
  `pairsPerPool` (def 5), `roundsPerSession` (def 3), `roundMinutes` (def 15),
  `pointCap` (nullable), `seedingRoundCount` (def 2), `seedMetric` enum
  (`'normalized_placement'` default | `'raw_points'`). **Round-transition rule:**
  at each round end, per-round King points reset to 0 AND the next round's lineup
  is re-seeded from the just-finished round's standings (1st = King, 2nd =
  challenger, rest queue in standings order). Cumulative points SUM across all
  rounds → the pool result that feeds the seed. (Replaces the old
  `kingResetBetweenRounds` toggle.)
- **`kotc_stages`** (per competition) — the rounds: `id`, `competitionId`,
  `ordinal` (1,2,3…), `kind` enum (`'seeding'` | `'elimination'`), `name`,
  `status` (reuse `matchStatus`: scheduled/in_progress/completed). Round1+Round2 =
  seeding stages; then one or more elimination stages.
- **`kotc_pools`** (per stage) — a pool = one KotC session group: `id`,
  `competitionId`, `stageId`, `name` ("Pool A"), `sortOrder`, `status`,
  `currentRoundIndex`, `clockStartedAt` (nullable). Re-pooling = new rows per stage
  (so pairs can be in different pools each stage — the current single-valued
  `teams.pool_id` can't express this, which is why KotC uses its own grouping).
- **`kotc_pool_pairs`** (membership join) — `kotcPoolId`, `teamId`, `entrySeed`
  (their seed entering this pool), `queuePosition` (initial rotation order).
- **`kotc_events`** (the rally/event log — append-only **source of truth**): `id`,
  `competitionId`, `poolId`, `seq` (monotonic per pool), `occurredAt` (timestamptz),
  `roundIndex`, `type` enum (`'round_start'` | `'rally'` | `'round_end'` | `'void'`),
  `kingTeamId`, `challengerTeamId`, `winnerTeamId`, `pointAwarded` (bool — true iff
  the King won), `voidsSeq` (nullable, for undo), `createdBy`. **This is what makes
  the 3-level tiebreaker computable** — see §3.
- **`kotc_pool_results`** (per pair per pool — the rankable aggregate, written by
  either path): `id`, `poolId`, `teamId`, `kingPoints`, `longestStreak` (nullable),
  `reachedFinalSeq` (nullable int), `reachedFinalAt` (nullable timestamptz),
  `unique(poolId, teamId)`. In **Phase 2** this is derived from `kotc_events`; in
  **Phase 1** the organizer enters `kingPoints` (+ optional `longestStreak`)
  manually and `reachedFinal*` stays null.
- **`kotc_seeds`** (per pair, after seeding rounds): `competitionId`, `teamId`,
  `seedScore` (numeric), `seedRank` (int), `computedAt` — the combined R1+R2 seed
  used to draft the elimination pools.

Why two representations (`kotc_events` + `kotc_pool_results`): the live engine and
the manual-entry path both produce a `KotcPoolResult` shape, so one ranker serves
both. The event log is the durable truth for live play; `kotc_pool_results` is the
cached, rankable summary (analogous to `standings_cache` being derived from
`matches`+`sets`).

---

## 2. Live scoring state machine — pure, testable, UI-free (`lib/kotc/`)

Mirrors the `lib/scheduler/` pure-function + vitest convention (plain in/out, no DB).
The engine runs **both** server-side (to derive standings/results from the log) and
**client-side** (instant optimistic scoring — see §7).

`lib/kotc/engine.ts`:
- Types: `KotcConfig`, `KotcEvent` (`{type:'rally', winnerSide:'king'|'challenger'}`,
  `round_start`, `round_end`, `void`), `KotcState`
  (`kingTeamId`, `challengerTeamId`, `queue: TeamId[]`, `pointsByTeam`,
  `currentStreakByTeam`, `longestStreakByTeam`, `roundIndex`, `clock`, `status`),
  `KotcPoolResult` (`teamId`, `kingPoints`, `longestStreak`, `reachedFinalSeq`,
  `reachedFinalAt`).
- `initKotcPool(pairOrder, config): KotcState` — King = pair 0, challenger = pair 1,
  rest queued.
- `applyEvent(state, event, config): KotcState` — pure reducer:
  - rally, **King wins** → King `+1` point, King streak `+1` (update longest);
    beaten challenger to back of queue; next challenger off the front.
  - rally, **challenger wins** → challenger becomes King (its streak starts at 0;
    dethroned King's streak ends); dethroned King to back of queue; new challenger
    off the front; **no point**.
  - `round_end` / clock-expiry / `pointCap` reached → rank the finished round and
    **re-seed the next round's lineup by those standings** (1st = King, 2nd =
    challenger, rest in order); reset per-round points to 0 (cumulative carries
    over); or mark session `complete` after the last round.
  - `void` → undo: recompute by folding over the log minus the voided rally.
- `reduceKotcPool(events, config): { state, results }` — folds `applyEvent` over the
  ordered log; emits live `state` **and** the per-pair `KotcPoolResult[]` (counts
  King points, tracks every streak to find the longest, records the seq/time each
  pair reached its final total).

Tests `tests/kotc/engine.test.ts`: rotation order, King-side transitions, point
award only on King wins, streak tracking across dethronements, the round-transition
re-seed (incl. reached-first breaking a tie), per-round reset vs cumulative sum,
pointCap, undo. ≥90% coverage (scheduler-grade).

---

## 3. KotC ranking / tiebreaker — pure (`lib/kotc/ranking.ts`)

The required hierarchy, modeled on `rankStandings` + the OVA `StandingRow` shape in
`lib/scheduler/tiebreakers.ts`:

`rankKotcPool(results: KotcPoolResult[]): KotcStandingRow[]` — orders pairs by:
1. **Total King-side points** (desc).
2. **Longest King-side streak** (desc) — longest unbroken run as King.
3. **Reached-first**: equal points **and** equal longest streak → the pair that
   reached that final total **earlier** ranks higher (`reachedFinalSeq` / time asc).
4. Unresolved (e.g. data missing) → `'TBD'` (organizer decides), like OVA step 5.

Each row carries `tiebreakerStep` (1–4) + an `explanation` string, so the UI can show
*why* a pair ranks where it does (the existing position-pill modal pattern in
`standings-table.tsx`).

**Data dependency (the reason the event log exists):** level 1 needs only a counter,
but **level 2 needs the sequence of King-side outcomes** (to reconstruct every streak)
and **level 3 needs per-point timing** (seq + timestamp). A running counter is
insufficient — so `kotc_events` records each rally's outcome + `seq` + `occurredAt`,
and `reduceKotcPool` distills them into `KotcPoolResult.{longestStreak,
reachedFinalSeq, reachedFinalAt}`. `rankKotcPool` consumes only the result struct, so
it's trivially unit-testable: ties at each level (equal points/diff streak; equal
points+streak/diff reach-time; full three-way ties; missing-data → TBD).

Phase-1 caveat: manual entry can supply `kingPoints` (+ optionally `longestStreak`)
but **not** `reachedFinal*`, so level 3 is inert in Phase 1 (ties there fall to TBD);
it activates automatically in Phase 2 when the rally log exists. The function is
written once and works for both.

---

## 4. Fair re-pool algorithm (Round 2) — pure (`lib/kotc/repool.ts`)

`repoolForRound2(pairs, round1Pools, sizes): TeamId[][]` — balance pool strength from
R1 results **and** minimize rematches. Net-new (no existing repeat-avoidance or
cross-pool balancing — confirmed). Pattern mirrors the Slice-3 optimizer
(`court-packing.ts` / `pool-ordering.ts`): deterministic greedy + local search.
1. Order pairs by R1 seed score (§5); **serpentine** into the new `sizes` via
   `snakeDraftIntoSizes` (`lib/scheduler/pools.ts`) → strength-balanced baseline.
2. Local search: 2-swap pairs between pools, accepting a swap that **reduces repeat
   poolmates** (pairs who shared an R1 pool now sharing again) without worsening
   strength balance beyond tolerance. Cost = lexicographic `(repeatCount,
   strengthVariance)` where `strengthVariance` = variance of per-pool summed seed
   scores. Tie-broken to the baseline (never worse than serpentine), fully
   deterministic.
3. Returns the new pools **plus** the residual repeat count (zero may be impossible
   with small pools) — surfaced in the review UI so the organizer can tweak before
   committing.

Tests: balance improves vs naive, repeats minimized, determinism, residual reported.

---

## 5. Seed metric + normalization (`lib/kotc/seed.ts`)

`computeKotcSeeds(seedingResultsByPool): KotcSeed[]`.

**Recommended metric — normalized pool placement, averaged across the 2 seeding
rounds.** For a pair finishing rank `r` (1 = best) in a pool of size `P`:
`placement = (P − r) / (P − 1)` ∈ [0,1] (1st = 1.0, last = 0.0; P=1 → 1.0). Seed
score = average of the pair's two round placements (higher = better). Tiebreakers on
the seed: (a) total King points across both rounds (raw, desc), (b) best single-round
placement, (c) TBD.

**Normalization question — yes, normalize, and here's why.** Raw cumulative King
points are **not** comparable across pools: pools differ in **strength** (staying
King against weak opponents inflates points) and **size** (more pairs/longer queues
change how often you're on King). Placement is **pool-relative** (cancels strength)
and the `(P−1)` denominator makes a 4-pool and a 6-pool **size-comparable** — so a
pair isn't penalized or rewarded for the luck of their draw. Raw points are offered as
a configurable alternative (`kotc_settings.seedMetric = 'raw_points'`) for organizers
who want the simpler, less-fair metric; default is normalized placement. (This is the
same philosophy as `crossPoolSeedOrder` in `tiebreakers.ts`, which deliberately
normalizes pools onto **ratios** rather than raw totals.)

---

## 6. Elimination seeding (`lib/kotc/seed.ts` + reuse)

Combined seed order (§5) → `snakeDraftIntoSizes(seedOrder, eliminationSizes)`
(serpentine balances seeds across elimination pools) → organizer **tweaks before
lock** via the editable-preview UI (§7). On lock, pools are fixed and play proceeds.
"Proceeds to a winner" = elimination stage(s) of KotC pools where top finisher(s) per
pool advance to a smaller next stage until a final pool crowns the winner; the
advancement shape (how many advance, how many elimination stages) is a
`kotc_settings`/per-stage config. Phase 1 ships a **single** elimination stage that
produces a final ranking (the advancement-to-a-final-pool chaining is a fast follow).

---

## 7. Live scoring UI (`components/kotc/`) + realtime strategy

No websockets/SSE/polling exist (confirmed) — the app is server-action + `revalidatePath`
+ `router.refresh()`. For rally-by-rally tapping that's too slow, so:

- **Scorekeeper runs the pure engine client-side (optimistic).** `live-scoreboard.tsx`:
  two big tap targets (≥56px, `h-14`) — "King side won" / "Challenger won" — showing
  current King pair, current challenger, the on-deck queue, each pair's running King
  points + current streak, a **client-side** round clock (`setInterval`), and Undo.
  Each tap updates local `KotcState` **instantly** via `applyEvent`, and **in the
  background** appends the event to the server (`appendKotcEventAction`, `useTransition`,
  debounced/batched). The append-only `kotc_events` log is the durable truth.
- **Spectator / standings view** is server-rendered: `reduceKotcPool(events)` →
  live state + `rankKotcPool` standings, on navigation or an **opt-in poll**
  (`setInterval(router.refresh, ~3s)` "live view" toggle). No realtime infra needed.
- **Pool assignment + re-pool review + elimination tweak-before-lock**: mirror
  `components/tournament/generate-pools-panel.tsx` — editable preview, serpentine
  auto + manual drag-to-pool, inline validation (and the §4 residual-repeat warning),
  commit/lock via a server action, then `router.refresh()`.
- **Creation**: a KotC creation path reusing the `tournament-wizard.tsx` shell
  (sport fixed to beach2) with a KotC settings step (pairs-per-pool, rounds,
  duration, point cap, seed metric). Mobile-first, shadcn, `tabular-nums` on all
  numeric displays (CLAUDE.md UI rules); the scoreboard must be one-handed at 375px.

Server actions in `server/actions/kotc.ts` (named exports, `ActionError` union,
`is_competition_admin` guard + RLS): create/configure, assign pools (per stage),
`appendKotcEventAction`, `voidLastKotcEventAction`, manual `submitKotcPoolResultsAction`
(Phase 1), `computeSeedsAction`, `repoolAction`, `seedEliminationAction`, `lockStageAction`.

---

## Phase 1 — NARROW first scope (logic + manual entry, no live tap)

Ship the **tournament-structure value** end-to-end without the hard real-time UI:

- **Schema:** all KotC tables + the `'kotc'` enum + RLS (events table created but
  unused in P1).
- **Pure logic (all unit-tested ≥90%):** `rankKotcPool` (3-level; level 3 inert
  without the log), `computeKotcSeeds` (normalized placement), `repoolForRound2`
  (fair re-pool), elimination snake seeding. **The live engine `reduceKotcPool` can
  be deferred to P2**, or built now and simply unused by manual entry.
- **Flow / UI:** create a KotC competition (beach2); **Round 1** — organizer manually
  assigns pairs into pools (single or multiple groups) and **manually enters each
  pair's King points per pool** (optional longest streak); compute seed; **Round 2** —
  app auto re-pools (tweakable), manual entry again; compute combined seed;
  **Elimination** — app auto-seeds pools (snake, tweakable, lockable), manual entry →
  final ranking/winner.
- **Explicitly deferred to Phase 2:** the live rally-tap scoreboard, `kotc_events`
  population + `reduceKotcPool` wiring, multi-court concurrent live sessions, the
  client-side optimistic engine + spectator polling, and the elimination
  advance-to-a-final-pool chaining. When P2 lands, level-3 reached-first activates
  automatically (same `rankKotcPool`), and per-pair results come from the log instead
  of manual entry.

This isolates the seeding/re-pool/elimination logic (your specific structure) from
the live-scoring engine (the real-time UI), and the schema + pure functions are built
so P2 slots in without rework.

## Critical files

- `lib/db/schema.ts` — `'kotc'` enum value + the new tables; new RLS migration `.sql`
  (mirror `0029_co_organizers.sql`); `npm run db:generate`/`db:migrate`.
- `lib/kotc/engine.ts` — NEW pure state machine (+ `tests/kotc/engine.test.ts`).
- `lib/kotc/ranking.ts` — NEW pure 3-level tiebreaker (+ tests).
- `lib/kotc/repool.ts` — NEW pure fair re-pool (+ tests).
- `lib/kotc/seed.ts` — NEW pure seed metric + elimination seeding (+ tests);
  reuses `snakeDraftIntoSizes` from `lib/scheduler/pools.ts`.
- `server/actions/kotc.ts` — NEW actions (admin-checked, RLS).
- `components/kotc/*` — NEW: pool-assignment panel (mirror `generate-pools-panel.tsx`),
  manual results entry (P1), live scoreboard (P2), standings view.
- `lib/formats.ts` — add a `beach2-kotc` rally preset (to 11, winBy config).
- Creation path reusing `components/tournament/tournament-wizard.tsx` shell; KotC
  sections on a new detail page `app/(app)/orgs/[orgId]/kotc/[id]/page.tsx` (or a
  branch in the org page), gated on stage status.
- Reuse: `is_competition_admin`/`can_view_competition` RLS, `snakeDraftIntoSizes`,
  the `generate-pools-panel` editable-preview-then-commit pattern, `standings-table`
  position-pill explainer pattern, `tiebreakers.ts` `StandingRow` shape as the model.

## Verification

1. **Unit tests (pure, no DB):** engine (rotation/King/point/streak/clock/undo),
   `rankKotcPool` (all tiebreaker levels incl. three-way ties + missing-data TBD),
   `computeKotcSeeds` (normalization correctness across unequal pool sizes),
   `repoolForRound2` (balance + repeat minimization + determinism), elimination snake.
   `npm test`, `tsc --noEmit`, lint, prettier.
2. **Manual (dev server, throwaway KotC comp):** create a beach2 KotC; run the
   16-pair example — assign R1 pools, enter King points, confirm seeds; trigger R2
   re-pool, confirm balance + reduced rematches in the preview, tweak, enter; confirm
   combined seed order; auto-seed elimination, tweak, lock, enter → winner. Confirm
   the existing tournament/league flows are untouched.
3. **Phase 2 later:** drive the live scoreboard, verify the event log reconstructs
   identical standings via `reduceKotcPool`, and that level-3 reached-first now breaks
   a constructed tie.

## Open decisions (defaults chosen; confirm at build time, not blocking)

- New `competition_type 'kotc'` (recommended) vs tournament format template — going
  with the new type.
- Round transition re-seeds the next round by the finished round's standings and
  resets per-round points (cumulative sum feeds the seed) — confirmed rule
  (replaced the old `kingResetBetweenRounds` toggle).
- Elimination advancement shape (single stage in P1; advance-to-final-pool chaining
  in P2) — configurable.
- Seed metric default = normalized placement (raw points available as a setting).
