# IDEAS

Deferred / out-of-current-scope ideas (per CLAUDE.md, ideas land here instead of
being built ad hoc).

## Ladder league — "tiers that teams move between every week"

**Status:** design captured 2026-08-06, not started, **one decision open**.
Full design: [`docs/plans/ladder-league.md`](docs/plans/ladder-league.md).

A box/ladder league: each tier plays among itself weekly, and that night's
results move teams between tiers. Organizer sets tiers + teams per tier, and a
per-team **sets or games** target per night which the app divides across the
night's pairings. Movement is a **balanced swap per boundary** (n up = n down),
so tier sizes stay constant while tiers themselves can be different sizes.
Decided by the night's results only; final placing is where you finish on the
ladder. Both engines are built and tested (`lib/scheduler/ladder-split.ts`,
`ladder-movement.ts`); schema, weekly cycle and UI are not. Big consequence: the
season schedule can no longer be pre-generated, only the calendar — matchups are
drawn week by week.

## Double elimination — "you're out when you lose twice"

**Status:** scoped 2026-09-16, parked, **one decision open**. Owner's words:
"we can pause on this, let's make this a good one to make in the future."

Prompted by a 12-team chart (23 matches: 11 winners-bracket, 10 losers, the
grand final, and a reset game labelled "L22 if first loss").

The load-bearing insight, which is why this is not a small feature: in single
elim, advancement is **arithmetic** — `bracketParent(round, position)` derives
the destination from the position alone. In double elim a loser's destination is
**not derivable**. It depends on the field size, where the byes landed, and the
crossing convention that stops two teams meeting twice. So the routing must be
generated as data and stored on the match row, not computed at score time. That
makes this "add an edge to the model", not "add a bracket type".

Sketch, if it gets picked up:

- **Migration** — `bracket_type` gains `double_elim`; `bracket_track` gains
  `losers` (the winners side, grand final and reset stay `championship`).
  `matches` gains `loser_to_track/round/position/slot`, nullable, where null
  means the loser is eliminated (every losers-bracket match, and the final).
  Plus an `if_necessary` flag for the reset game — precedent is the
  `isThirdPlace` match in `lib/scheduler/bracket.ts`, which is already a match
  whose teams arrive *by losing* and which tree-walkers must skip.
- **`lib/scheduler/double-elim.ts`** — pure, and the bulk of the work. The
  winners side reuses `seededBracketMatches` verbatim, byes and all. New is the
  losers-bracket shape: rounds alternate between losers-bracket survivors
  playing each other and survivors meeting a fresh drop-down from the winners
  bracket, with the drop-down cross-placed to avoid an immediate rematch.
- **Progression** — `advanceBracketWinner` (`lib/bracket/advance.ts`) already
  computes the winner; it gains the loser and one RPC writing both routes in a
  single transaction. The grand final needs an explicit rule: if the
  losers-bracket team wins it, the reset game goes live; otherwise it's voided.
- **UI** — the wildcard. `bracket-tree.tsx` draws a clean binary tree and the
  losers bracket is not one; teams enter mid-round. V1 should render the winners
  side as the existing tree and the losers side as round-by-round columns rather
  than half-building a renderer that can't express drop-ins. Plus the generate
  panel option and additions to `BracketTrackKey` / `TRACK_ORDER` in
  `lib/queries/bracket.ts`.
- **Tests** — `tests/scheduler/double-elim.test.ts`: match count is 2n−2 (one
  more with the reset), the routing map is total and injective so no two losers
  land in the same slot, no rematch before the final, at 8/12/16/24/32 where the
  bye counts differ.

**The open decision: reset game or Olympic crossover.** The chart has game 23 —
the losers-bracket team must beat the winners-bracket team twice. AVP doesn't do
that: their majors run double elim until four remain, then play straight semis
and a final, no reset. It changes the generator's last round, so settle it
before writing code rather than building both.

Tournament-side only; leagues (Big Shoots, BVL) are unaffected. **Note the
prerequisite bug** recorded in HANDOFF "Known quirks": `place_bracket_winner`
has no `bracket_track` predicate, which double elim cannot live with.

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

**Status:** APPROVED, building (decisions locked 2026-07-30). Full design +
locked decisions: [`docs/plans/registration-payments.md`](docs/plans/registration-payments.md).
Stripe Connect **Express**, **pass-through** fees, platform fee 1% (tournaments)
/ $3 per player or $20 per team (leagues), admin-adjustable. Building in slices
A (payouts onboarding) → B (paid registration) → C (payment management).

Teams pay the registration fee online at registration via **Stripe Connect**;
money routes to the organizer's own bank, minus the platform fee. The win is
**collecting at registration** (kills e-transfer chasing), offered *alongside*
cash/e-transfer, not instead. Covers the fee model (pass-through gross-up so
organizers net their target), payout timing, refunds, and **split payments**
(captain pays all, or everyone pays their share; team confirmed only when the
shares complete). A **v1** feature (PRD §14). Still needed from the owner before
money can move: **Stripe test keys**, then the refund policy + tax stance copy
for go-live.
