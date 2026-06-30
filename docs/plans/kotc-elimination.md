# KotC full elimination engine — plan (replaces the Phase-1 simple elimination)

> Status: **PLAN ONLY, not built.** Replaces the placeholder elimination that
> Phase 1 shipped (draft pools → one results card → done). The **seeding phase
> stays exactly as-is** (2 re-pooled rounds → combined seed via `computeKotcSeeds`).

## The structure being built

1. **Seed into elimination pools** — *unchanged*: snake-draft the combined seed
   into pools (`seedElimination` → `assignKotcPoolsAction`, organizer tweaks + locks).
2. **Iterative drop within each pool** — the pool plays a KotC round; the
   **lowest-ranked pair** (by the existing total → longest-streak → reached-first
   tiebreaker, `rankKotcPool`) is dropped; repeat with the survivors **until exactly
   3 remain**. Those 3 advance to the finals.
3. **Consolation** — **all** pairs dropped across **all** pools play **one** KotC
   round together; the single winner (rank 1) earns **1** finals spot. *(Confirmed
   one round, not iterative — see below.)*
4. **Finals** — the 3-from-each-pool **plus** the 1 consolation winner form the
   finals roster, which runs the **same iterative drop-until-3 loop** as an
   elimination pool: play a round, drop the lowest, repeat until exactly 3 remain.
   Those final 3, by their `rankKotcPool` order in that last round, **are the
   podium** — 1st / 2nd / 3rd. No separate deciding round, no drop-to-1.

Round math: a pool of size **P** plays `max(0, P − 3)` drop-rounds. **8 → 5 rounds**
(8→7→6→5→4→3); **4 → 1 round** (4→3); **P ≤ 3 → 0 rounds, all 3-or-fewer advance
directly**.

---

## (a) Modeling the iterative play → drop → repeat loop (it's stateful)

The current engine plays a *session* of timed rounds with a re-seed between them —
that's the **seeding** rhythm. Elimination is a different rhythm (play one round →
rank → drop the lowest → play the *next* round with a smaller roster), so it gets a
thin **stateful layer on top of the existing round primitives**, not a change to the
engine.

Model it as a **sequence of KotC rounds per pool**, each with a drop:

- A new **`kotc_rounds`** row per iterative round (round_index 0..n). Each round is
  one ordinary KotC round — play (live rally events, Phase 2) or manual per-pair
  entry (Phase 1) — ranked by the existing `rankKotcPool`.
- After a round completes, a pure decision: if `eliminationComplete(remaining)` (≤3)
  → stop (survivors advance); else `dropLowest(roundResults)` marks one pair
  `eliminated_at_round = round_index`, and the next round opens with the survivors.
- Orchestrated by one action, `advanceEliminationRoundAction` (record this round's
  results → drop/stop decision → open the next round or finalize the pool). The
  **decisions are pure** (`eliminationRoundsNeeded`, `dropLowest`,
  `eliminationComplete`); only the persistence + "play a round" are IO.

So the engine still just plays a round; the loop is the round-sequence + drop
markers + the stop rule. No single-shot "elimination = one results set" anymore.

## (b) Collecting eliminated pairs for the consolation

Each drop sets `kotc_pool_pairs.eliminated_at_round` on the dropping pool. The
consolation roster is simply **every elimination-pool pair with
`eliminated_at_round IS NOT NULL`**, gathered across all pools
(`gatherConsolation`). They become the membership of the single **consolation pool**;
one round → `rankKotcPool` → the rank-1 pair is the consolation finalist.

**Confirmed: consolation stays ONE round, not iterative.** It must produce a
*single* finalist, but the drop-until-3 loop yields *three* survivors — it doesn't
fit a one-winner output (that would need a "stop at 1" rule nothing else uses). A
single ranked round is the right primitive here; the finals (which wants a podium of
3) reuses the loop, consolation does not.

**Consolation round duration is ALWAYS 15 minutes — fixed, not the configured
`kotc_settings.round_minutes`.** A `CONSOLATION_MINUTES = 15` constant (in the
consolation action, not read from settings) is written to that round's
`kotc_rounds.minutes`; elimination/finals rounds carry the configured value.

## (c) Composing the finals roster, then running the SAME drop loop

- **Top 3 per pool**: the survivors of each elimination pool
  (`eliminated_at_round IS NULL` ⇒ the 3 that were never dropped).
- **Consolation winner**: rank-1 of the consolation round (null if no one was
  eliminated anywhere).
- `composeFinals(advancersPerPool, consolationWinner)` flattens the per-pool trios
  and appends the consolation winner → the **finals pool** membership
  (size `3 × poolCount + (consolation ? 1 : 0)`).
- The finals pool then runs the **identical iterative drop loop** as an elimination
  pool: `eliminationRoundsNeeded(rosterSize)` drop-rounds, each `rankKotcPool` →
  `dropLowest` → repeat until 3 remain. The **final round's top-3 ranking is the
  tournament podium** (1st/2nd/3rd) — there is no extra deciding round and no
  drop-to-1. So the finals adds essentially **no new logic**: it reuses
  `eliminationRoundsNeeded` + `dropLowest` + `rankKotcPool`; only the *interpretation*
  differs ("the last round's 3 survivors, ranked, are the result").

## (d) Data model — mostly fits; add a round dimension + two stage kinds

The seeding tables fit unchanged. Elimination needs a **per-round** dimension the
current "one results set per pool" model lacks, plus places for consolation/finals.
Additive changes (no seeding breakage):

- **`kotc_stage_kind` enum** → add **`'consolation'`** and **`'finals'`**. Create one
  consolation stage and one finals stage (each holds a single pool). Elimination
  pools stay in the existing `'elimination'` stage.
- **`kotc_rounds`** (NEW) — `id, competition_id, pool_id, round_index, status,
  minutes, created_at`. One row per iterative elimination round; the consolation and
  finals pools each get a single round (index 0). This is "a played KotC round."
  `minutes` is the round's clock duration: the configured `round_minutes` for
  elimination/finals rounds, and a fixed `CONSOLATION_MINUTES = 15` for the
  consolation round (set by the action, never read from settings).
- **`kotc_round_results`** (NEW) — `id, competition_id, round_id, team_id,
  king_points, longest_streak, reached_final_seq, computed_at`,
  `unique(round_id, team_id)`. Per-round results (manual entry writes here; live
  derives from events). Seeding keeps `kotc_pool_results` (its per-session aggregate)
  as-is — the two coexist; converging them is an optional later cleanup.
- **`kotc_pool_pairs.eliminated_at_round`** (NEW, int nullable) — the drop marker;
  null = still in / advanced.
- **`kotc_events.round_id`** (NEW, uuid nullable) — attaches a live rally to a
  specific elimination/consolation/finals round (Phase 2).

`kotc_pools` is reused for the elimination pools **and** the consolation pool **and**
the finals pool (distinguished by their stage's kind). So: existing tables carry the
groups; the **new round-level tables** carry the iterative play + drops.

## (e) Pure, testable functions (`lib/kotc/elimination.ts`)

All pure (no DB/UI), mirroring `lib/scheduler/` + the existing `lib/kotc/` style,
with ≥90% coverage:

- `eliminationRoundsNeeded(poolSize: number): number` → `Math.max(0, poolSize − 3)`.
- `dropLowest(results: KotcPoolResult[]): { dropped: TeamId; remaining: TeamId[]; tied: boolean }`
  — ranks via `rankKotcPool`; `dropped` = the last row, `remaining` = the rest.
  **`tied` = true when the last two rows are a true tie** (`tiebreakStep === 4`
  between them — equal on points, streak, AND reached-first). See tie handling below.
- `eliminationComplete(remaining: number): boolean` → `remaining <= 3`.
- `gatherConsolation(pools: { eliminated: TeamId[] }[]): TeamId[]` — flatten all drops.
- `composeFinals(advancersPerPool: TeamId[][], consolationWinner: TeamId | null): TeamId[]`
  — flatten the trios, append the consolation winner if present.

Round ranking, the winner (rank 1), and the lowest (last) all reuse the existing
`rankKotcPool` — no new tiebreaker logic.

**Ties-for-lowest (explicit):** the drop is resolved by the existing hierarchy —
**(1) fewest total King points → (2) shortest longest-streak → (3) reached the total
latest** (i.e. the inverse of the ranking; the last row of `rankKotcPool`). In live
play the reached-first/seq dimension (distinct event seqs) always breaks it, so a true
tie cannot occur. Only **manual entry** (no rally log → no `reachedSeq`) can produce a
genuine tie for last; `dropLowest` returns `tied: true` and the action **blocks the
auto-drop and prompts the organizer to choose** who drops — never silently guesses.

## (f) Replace vs. reuse

**Reused unchanged:** all seeding (2 re-pool rounds, `computeKotcSeeds`, `repool`),
`seedElimination` (snake into pools), `rankKotcPool`, the engine's rally/round
mechanics (`applyEvent`/`reduceKotc`), `kotc_pools`/`kotc_pool_pairs`/`kotc_events`,
`assignKotcPoolsAction` + `PoolBuilder` (seed/tweak/lock the elimination pools),
`seedEliminationAction`, `lockKotcStageAction`.

**Replaced:** the Phase-1 elimination's "one pool → one `ResultsCard` → done":
- The elimination-stage rendering on the detail page → an **iterative drop UI** per
  pool (play round → standings → "drop lowest" → repeat until 3), plus new
  **Consolation** and **Finals** sections.
- Using `submitKotcPoolResultsAction` for elimination pools → per-**round** results
  entry + `advanceEliminationRoundAction` (drop/continue). (`submitKotcPoolResultsAction`
  stays for **seeding** pools.)
- `kotc_pool_results` as the elimination store → `kotc_round_results` + the
  `eliminated_at_round` markers.

**Added:** `kotc_rounds`, `kotc_round_results`, `eliminated_at_round`,
`kotc_events.round_id`, `'consolation'`/`'finals'` stage kinds;
`lib/kotc/elimination.ts` + tests; actions (`advanceEliminationRoundAction` — the
generic drop-loop step, reused by elimination pools **and** the finals pool;
`runConsolationAction` — one round → winner; `composeFinalsAction` — build the finals
pool from the trios + consolation winner, after which it runs the same
`advanceEliminationRoundAction` loop). UI for the iterative drop, consolation, and
finals (the finals reuses the iterative-drop panel).

## Edge cases the implementation must cover (and test)

- **8-pool → 5 rounds** (`eliminationRoundsNeeded(8) === 5`); **4-pool → 1**;
  **3-pool / 2-pool → 0** (all advance directly, **no `kotc_rounds` created**).
- **Tie for lowest** → resolved by total → streak → reached-first; a true tie
  (manual entry only) → `tied: true` → organizer breaks it; never auto-dropped.
- **Consolation with 0 eliminated pairs** (every pool ≤3) → no consolation round, no
  extra finalist; finals = the trios only.
- **Consolation with 1 eliminated pair** → trivial winner.
- **Finals** = roster of `3×poolCount + (consolation?1:0)` → runs the drop loop
  (`eliminationRoundsNeeded(rosterSize)` rounds) down to 3; the last round's ranked
  3 are the podium. A finals roster already ≤3 (e.g. a single elimination pool +
  no consolation) plays 0 rounds → its 3 are the podium by their advance order /
  first finals round.

## Build order (engine-first, each layer its own commit, verify before deploy)

1. `lib/kotc/elimination.ts` pure fns + tests (the edge cases above) — show green.
2. Schema migration: new tables/columns/enum values + RLS (mirror migration 0036).
3. Actions: `advanceEliminationRoundAction`, consolation, finals (admin-gated, zod).
4. UI: iterative-drop panel, consolation section, finals section (replace the
   Phase-1 elimination rendering).
5. Manual E2E on a throwaway KotC: 8-pool runs 5 drops → 3; consolation gathers all
   drops → winner; finals = trios + winner → champion.

## Verification

- Unit: `eliminationRoundsNeeded` (8→5, 4→1, 3→0, 2→0), `dropLowest` (normal +
  `tied` flag on a manual-entry tie), `eliminationComplete`, `gatherConsolation`
  (across pools + empty), `composeFinals` (with/without consolation winner). Plus a
  **drop-loop composition test** — iterate `dropLowest` until `eliminationComplete`
  on a synthetic roster and assert it takes `eliminationRoundsNeeded(N)` rounds and
  ends with exactly 3 (this is the shared elimination-pool *and* finals behavior).
  ≥90% coverage.
- E2E through the UI as above; confirm seeding + existing league/tournament flows
  untouched.
