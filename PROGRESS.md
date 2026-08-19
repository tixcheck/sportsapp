# Progress

A log of what shipped each session. Newest first. Detail on current state and
gotchas lives in `HANDOFF.md`; this file is the "what happened when".

---

## 2026-08-18 — Player stats and profiles

**Shipped.** An organizer keeps a spreadsheet of per-player numbers — games
played, wins, points for/against, win %, points played, and a "clutch" block
counting sets won or lost by two points or fewer. They asked whether the app
could produce it. It can; all eleven columns come from data already stored.

**The formulas were reverse-engineered from their own sheet** rather than
guessed, because matching numbers they can check is what makes this
trustworthy. From one row: points played ÷ GP = 45.3 while average points for =
22.5, so "points played" counts BOTH directions and "average" counts only
theirs — conflating those two was the easiest way to get this wrong. Their
published 53.6% win, +8 net clutch and 26% clutch rate are asserted in the
tests.

**The real problem was never the arithmetic — it was attribution.** Scores are
per MATCH and a match belongs to TEAMS, so putting a number against a person
needs to know which sets that person was on court for. `lib/stats/player-stats.ts`
is therefore pure and takes a flat list of "what I scored, what was scored on
me"; deciding which sets those are lives separately in `lib/queries/player-stats.ts`.
That seam is what lets the 6s work add an attendance rule later without
touching any of the maths.

Today's rule is fixed-roster: everyone on a team is credited with every set the
team played. **Exactly right for 2s**, where a team IS its two players — Helix's
three beach leagues get real profiles with no new data at all. An approximation
for 6s, where people miss nights; that is what attendance will fix.

**Decisions taken with the owner:** attendance (when built) will assume the
roster played and let captains mark absences, rather than requiring a check-in;
and pairs ship first.

**Where it lives:** a Stats tab on the organizer's league page with the full
sortable table, and `/players/[playerId]` for one person's career plus a
per-competition breakdown. Career totals are recomputed from the combined set
list, not summed from the per-competition rows — averages and ratios don't add.

**Rosters are the practical limit.** The table draws on linked accounts plus
unclaimed invites, because a pair where one partner never claimed would
otherwise show as half a team. Unclaimed rows are badged and have no profile
behind them. In Top Gun, 6 of 27 player rows are still unclaimed.

Verified against Top Gun Summer 2026: 27 player rows, each pair's figures
matching the team-level numbers exactly. 17 unit tests on the engine.

---

## 2026-08-15 (later) — Individual sign-ups: free agents

**Shipped.** Most leagues take teams AND individuals — people with no team who
get placed. The app only modelled the first.

**The model decision.** A free agent is deliberately NOT a `teams` row. A team
is an ENTRANT: the schedule generator, standings, the payments dashboard and the
public team list all read `teams`. A person waiting to be placed is none of
those, so modelling them as a team would mean adding an exclusion to every one
of those readers — and the day one was missed, a free agent turns up in a
fixture. They get their own table; a `teams` row appears only when the organizer
actually forms a team.

**What a player answers** (migration `0076`): name, email, optional phone,
positions, level, and free-text notes. Positions come from
`sportConfig(sport).positions` — the five volleyball positions for indoor 6s and
co-ed 4s. Beach 2s and softball get NO position question: 2s roles are blocker
and defender, softball's are unconfirmed, and offering the wrong five would be
worse than asking nothing. Levels are Rec / Rec Intermediate / Intermediate /
Competitive, shared across sports.

**Money** (migration `0077`). The organizer sets a per-individual fee,
independent of the team fee. It is priced at the PER-PLAYER platform rate, not
the per-team one — a free agent is one payer settling one entry, and billing
them a team rate would charge one person as though they were a roster.
`registration_payments.team_id` became nullable with a `free_agent_id` beside it
and an XOR check, rather than inventing the placeholder team the whole design
avoids. Unpaid sign-ups sit at `pending_payment` and the webhook releases them.

**Placement.** `place_free_agents` writes the roster row and the status together,
and MOVES anyone already on another team rather than leaving them on two. The
organizer either forms a new team from a selection or tops up a short one.

**Verified against the live database**, impersonating real callers with
`set local role authenticated` — 20 checks, all passing: refused when the flag is
off, refused when registration is closed, trimming/lowercasing, re-signup edits
rather than duplicates, pending when a fee is set, an unrelated user sees
nothing, the player sees only their own row, the organizer sees the list, a
non-organizer cannot place anyone, and a move clears the old roster row.

**Also fixed, found while testing:** `getCompetitionVenues` returned every venue
in the ORG, so the softball registration page advertised 11 venues including
Brampton school gyms it has nothing to do with. It now returns only venues the
competition actually uses (matches, court list, divisions), and nothing at all
when none are assigned — the competition's own `venue` text already covers that.
Softball now shows 2, the BVL demo 6 instead of 11.

**Not done:** no refund path specific to individuals (a refunded sign-up doesn't
auto-withdraw — the organizer withdraws them, same as teams), and no live
test-mode payment has been run end to end.

---

## 2026-08-15 — Softball: the app stops assuming volleyball

**Shipped.** A prospective organizer asked whether we could run their softball
league. We can — and it cost far less than expected, because the scheduling
engine turned out to be entirely sport-agnostic already: nothing in
`lib/scheduler/` references `sport` at all. Round robins, divisions, pools,
venues, court assignment and referee rotation all work unchanged.

What WAS volleyball-specific was **scoring** and **vocabulary**.

**Scoring.** A softball game is one final score, so it stores as a single `sets`
row. Two new `match_format` flags carry the difference (jsonb — no DDL):

- `untargeted` — there is no target to reach, so no "below the target" warning
  and no win-by-two rule. A 15–0 game is just a 15–0 game.
- `allowTie` — a regular-season game may finish level; a playoff game may not,
  because it goes to extra innings. `validateScore` treats a drawn single game
  as a complete result when the format says so, and rejects it when it doesn't.

**A real bug this surfaced.** `computeStats` only counted a tie when both sides
had won a set — true of a drawn volleyball game, false of any sport whose match
IS a single period. A 6–6 softball game registered as nothing at all: not a win,
not a loss, not even a game played. The guard is now "a score was recorded"
rather than "someone won a set", which also makes a 0–0 tie count. Volleyball is
unaffected (a drawn game is 1–1, so both tests agree). Five tests added.

**Vocabulary.** `lib/sports.ts` is a small pure config layer — what a sport calls
its surface, its scored periods, its officials, and its points columns. It
replaced hard-coded "Court"/"Set"/"Ref"/"PF" strings across the schedule,
standings, score entry, print view, dashboard and weekly digest.
`formatCourtLabel(court, sport?)` is now the single entry point and defaults to
volleyball, so every existing caller is correct without passing anything. Adding
the sport after softball should be a config entry, not another sweep.

Standings needed no new columns: softball's `differential` tiebreaker and
single-set play already hid SW/SL and the set ratio. Only the labels moved —
PF/PA → RF/RA, "point differential" → "run differential".

**Migration `0075`** applied (the `sport` enum gained `softball`).

**Mocked in Test Org** so the organizer can see it: *Sunday Softball — Fall 2026*
at `/l/softball-mock-fall-2026`. Six teams, a full round robin over five
Sundays, then a playoff week. Three diamonds across two parks — East and West at
one, Oriole at the other — which exercises the venues model from `0071`. Three
weeks are played, including two ties. **The fixtures come from the real
`generatePairings`**, deliberately: that the untouched generator produces a
softball schedule is the claim being demonstrated.

**Assumed, not confirmed** — the organizer's own sheet was never supplied, so
team count, dates, times, park names and team names are all invented. The shape
is what matters; the specifics are a re-seed away.

**Not done:** per-inning scoring (only the final score is recorded), and
softball's own preset formats are in `lib/formats.ts` but no UI offers them yet.

---

## 2026-08-14 — Mango Sports ladder: per-tier nights and the staggered start

**Shipped.** An organizer asked for a 2-tier ladder where the tiers run on
genuinely different timetables, and one team arrives late as a reward for
finishing top. Every part of that broke an assumption in the ladder engine.

- **Migration `0073`** (applied). Per-tier overrides on `divisions`:
  `ladder_target`, `minutes_per_set`, `start_time`, `late_start_slots`. Null
  means "use the league's value", so every existing ladder is untouched.
  `divisions.courts` already existed for court pinning.
- **`lib/scheduler/ladder-night.ts`** — orders one tier's sets across its own
  night on a single court. `ladder-split.ts` decides who plays whom; this
  decides the running order, which is what players actually feel: no more than
  two sets back to back, no 45-minute waits, and **no back-to-back rematches**
  (the first attempt put the same pairing in slots 11 and 12).
- **The staggered start is expressed in SLOTS, not a clock time**, so "skip the
  first four sets" survives a change to set length.
- **The naive version of a late start is a trap**, and there's a test that says
  so: held back as long as arithmetically possible (8:30 here), the top team
  then has to play all six remaining slots **consecutively** — 90 minutes
  without a break, as the reward for winning. Arriving at 8:00 instead gives
  play-2, rest, play-2, rest, play-2.

**The league is live**: `/l/mango-ladder-fall-2026` — 7 teams, 2 tiers, 5
Tuesdays Aug 18 → Sep 15, week 1 drawn (18 sets).

| | Teams | Sets each | Set length | Window | Court |
|---|---|---|---|---|---|
| Tier 1 | 3 | 4 | 20 min | 8:00–10:00 | 1 |
| Tier 2 | 4 | 6 | 15 min | 7:00–10:00 | 2 |

Sets to 25 win by 2, 1 up / 1 down between tiers. Verified on the drawn night:
everyone gets their full share, nobody plays more than 2 in a row, longest wait
is 2 slots.

**Only week 1 is drawn, deliberately.** A ladder can't be pre-generated — who
plays whom in week 2 depends on where week 1 finishes — so the season carries a
calendar and each night is drawn once the previous one is scored.

**Tests:** 824 passing across 68 files. tsc, eslint and build clean.

**Not done:** `drawLadderWeekAction` still uses the league-wide values and packs
tiers into shared waves, so weeks 2–5 need the draw action taught to read the
per-tier columns. Week 1 was written directly. There's also no UI yet for
setting the per-tier fields.

---

## 2026-08-13 (later still) — Auto venue assignment

**Shipped.** Slice two taught the generator to respect a division's venue; this
chooses it. An **Auto-assign** button on the league page proposes which gym each
division plays in and fills the selects — it writes nothing, so the organizer
reviews a proposal in the same controls they'd use by hand.

- **`lib/scheduler/venue-assign.ts`** — 2-D packing: each venue is a
  `courts × slots` grid and each division a rectangle that must sit inside one
  grid. `courtsNeeded` is an INPUT, not `teams / 2` — BVL's D2 runs 8 teams
  across 2 courts, so half the division sits each round, and deriving it would
  bake in an assumption that's wrong for real data.
- **Fairness is the point, not packing.** Somebody always draws the late block —
  with more divisions than early slots that's arithmetic. What you control is
  *who*, round after round. `latenessFromHistory` reads the debt off the games
  already played, and the most-owed division picks first.
- **A bug worth recording:** weighting lateness only inside the cost function did
  nothing, because whoever is placed *first* takes the best slot regardless.
  Lateness had to lead the sort ORDER. The rotation test caught it.
- **A second, worse bug, found by running it on the real BVL shape.** Changeover
  smoothing was nudging blocks off alignment — a 3-round division starting at
  slot 1 of a 6-slot gym strands a 1-slot gap before and a 2-slot gap after,
  neither usable. Two divisions ended up unplaced while five gyms sat half
  empty. Fixed by restricting starts to *anchors*: the top of the night, or the
  moment the gym frees up. Both cases are now regression-tested.

**Measured on BVL's real Thursday** (9 divisions, 6 gyms) over 10 simulated
rounds: all 9 placed every round, 17% idle capacity, and the eight comparable
divisions land on an **identical mean start slot — a spread of 0.00**. Nobody is
shut out of an early block. (D2 is structurally pinned to slot 0: it needs all
seven slots at Terry Miller, so it has no choice.)

**Tests:** 809 passing across 67 files. tsc, eslint and build clean.

**Honest limit:** with 6-slot gyms and 3-round divisions every gym must flip at
slot 3, so the changeover smoothing has nothing to work with here — the worst
changeover stays at 48 teams. It only helps where block lengths differ. Making
the night's slot count itself a variable is what would fix that, and it isn't
in this slice.

---

## 2026-08-13 (later still) — Venues slice two: the generator learns about buildings

**Shipped.** Slice one made venues real so an existing schedule could be *read*
correctly. It taught the generator nothing: court assignment was still global
across a night, and the whole league shared one start time.

- **Migration `0072`** (applied, verified). `divisions.venue_id` — a division
  plays its night in one building, which is what lets courts be handed out per
  venue. Per-venue start times need no DDL: `weekly_slots` is jsonb, so a slot
  gains an optional `venueId` and the league carries one slot per venue. BVL's
  Thursday starts 6:00 at Jim Archdekin, 6:15 at St. Augustine, 6:30 at Terry
  Miller — one start time for the night cannot express that.
- **`planTieredLeagueSchedule` groups by venue as well as by instant.** Without
  it a six-gym night draws court numbers from one pool and puts two games on the
  same physical court. Passing no venues preserves the old behaviour exactly —
  all 431 existing scheduler tests were untouched.
- **Over-capacity is now reported, not silently absorbed.** Wrapping court
  numbers was always the fallback; doing it quietly is what made it dangerous.
  Four divisions assigned to a three-court gym produced a schedule that looked
  fine and double-booked a court all night.
- **`lib/scheduler/venue-conflicts.ts`** — a pure auditor over any schedule,
  generated or imported: court double-booked, team double-booked, venue over
  capacity, a team driving between gyms mid-night, a division split across
  buildings. 18 tests.
- **A Schedule check card** on the organizer page, shown even when clean —
  "no problems" is the reassurance you want before publishing, and a card that
  only appears when something is wrong is one nobody trusts is running.

**The auditor caught a bug in itself.** Run against the real BVL data it
reported five split divisions on Thursdays and three on Wednesdays. All false:
BVL *rotates* gyms week to week — Division C1 plays Jim Archdekin one week and
St. Marguerite the next — so comparing across a season flags every well-run
league in the system. Scoped to a single night, all three schedules come back
clean. That check is now pinned by a test built from the real pattern.

**Tests:** 784 passing across 66 files (up from 760/65). tsc, eslint and build
clean.

**Still not done:** the generator places a division at its venue but does not
*choose* venues — an organizer assigns them. Automatic assignment (balancing
divisions across gyms by size and court count) is a further slice, and probably
wants the changeover-load thinking from the beach analysis folded in.

---

## 2026-08-13 (later still) — Slice C finished: the two split-payment escapes

**Shipped.** An audit of Slice C against the plan found the five headline items
built, but two actions the plan explicitly promises were not. Both exist for the
same failure: a split fee stalls at "$45 of $60" because one teammate never
pays, and there is no way out.

- **"Cover the rest"** (captain / any team member). One payment for the
  outstanding balance, recorded as a `team_full` charge for the REMAINDER — not
  the whole fee. `teamPaymentState` sums `price_cents` across live rows, so the
  paid shares plus the remainder come to exactly the organizer's price. Four
  tests pin that invariant, including an uneven 5-way split where the remainder
  isn't a round share, and the case where refunding the covering payment
  correctly reopens the balance.
- **"Refund all N payers"** (organizer). Unwinds every refundable charge on a
  team with one reason typed once. Failures are collected rather than thrown —
  refunding three of four and reporting the fourth honestly beats aborting
  halfway with no record of which went through.

The amount is always recomputed server-side from the stored rows; a
client-supplied remainder could be forged, and the roster can change between the
page rendering and the click.

**Tests:** 760 passing across 65 files. tsc, eslint and build clean.

**Slice C is now complete.** What remains before payments can be relied on is
not code: no refund has been exercised against real Stripe money yet (unit tests
and rolled-back DB checks only), and go-live still needs live keys, real Connect
onboarding, and TOS / refund / surcharge disclosure copy.

---

## 2026-08-13 (later) — Venues: a competition can span several buildings

**Shipped.** Until now the model was one competition, one venue —
`competitions.venue` was a single text column and courts were a flat list of
labels. That holds for a beach league in one park. It does not hold for BVL's
indoor season, which runs **9 divisions across 6 school gyms on the same
night**, each gym with its own Court A/B/C.

- **Migration `0071`** (applied, verified). A `venues` table hanging off the
  **org**, not the competition — an organizer books the same gyms season after
  season, so the address and the "enter through the east doors by the garbage
  bins" note are typed once. Plus `matches.venue_id`, and `venueId` on each
  `LeagueCourt`.
- **Court labels collide across venues.** Every gym has a "Court A", so a label
  can no longer identify a court. That single fact drove the shape: the venue
  has to be stored on the match, not inferred, and `(venue, label)` is the only
  safe court identity.
- **A real bug this exposed:** the By-court schedule view keyed purely on the
  normalized label, so six gyms' "Court A" collapsed into one column and read as
  a six-way clash. Now keyed on venue + label.
- **`lib/venues/resolve.ts`** is pure and unit-tested (23 tests): court identity,
  placement formatting, grouping a schedule by building, and `isMultiVenue`.
- **The venue only shows when it earns its place.** `isMultiVenue` is measured
  against the *schedule*, not the venue list, so a single-site league still reads
  "Court 10" rather than "Woodbine Beach · Court 10" on every card.
- **UI:** a Venues card on the org page (address, entry directions, doors note,
  maps link) and a Court venues card on the league page that assigns each court
  to a gym — and stamps the venue onto games already scheduled there, so the
  court list and the schedule cannot drift.
- **Deleting a venue never deletes games.** The FK is `on delete set null`; the
  games keep their times and fall back to the competition's venue.

**Proven against real data.** Both BVL demos were converted off the
"venue baked into the court label" workaround: 151 + 83 games re-pointed, all
234 placed, and **Terry Miller came out as ONE org-level venue row shared by two
different leagues** — which is the entire argument for org-scoping.

**Tests:** 756 passing across 65 files (up from 733/64). tsc, eslint and build
clean.

**Deliberately NOT in this slice**, and worth stating because BVL's sheets use
both: per-venue start times (their Thursday night starts 6:00 at one gym, 6:15
at another, 6:30 at a third), and a venue-aware *generator* — nothing yet stops
the scheduler putting a team in two buildings back to back. Those need
`weekly_slots` and the scheduler itself to change, which is a second slice.

---

## 2026-08-13 — Payments Slice C: organizer payment management

**Shipped.** Slice B could take money. Slice C is what an organizer does about
it afterwards: chase it, forgive it, hand it back, or take a team without it.

- **Migration `0070`** (applied and verified). Refund state on
  `registration_payments` (`refunded_cents`, `stripe_refund_id`, `refunded_at`,
  `refund_reason`) with two check constraints — you can't refund more than was
  charged, and you can't refund a charge that never collected. Plus the
  admit-unpaid trail on `teams` and two SECURITY DEFINER functions.
- **Refunds** — pro rata, the way Stripe actually splits a destination charge.
  `reverse_transfer` + `refund_application_fee` mean the organizer and the
  platform each give back their own proportion; without them the refund would
  come entirely out of the platform's balance. `lib/payments/refunds.ts` is
  pure and derives the organizer's share by SUBTRACTION so the three parts
  always sum to the refund exactly — three independent `round()` calls can lose
  a cent, and a cent belonging to nobody is a reconciliation bug six months on.
- **The organizer writes nothing.** The refund action calls Stripe; the
  `charge.refunded` webhook records it, exactly as `checkout.session.completed`
  records a payment. `amount_refunded` is cumulative, so storing it directly is
  idempotent for free.
- **Partial-payment approval** — `admit_team_unpaid` promotes a
  `pending_payment` team to a real entrant. It deliberately does NOT clear the
  debt: the balance keeps showing on the dashboard, and who admitted them, when,
  and why is recorded. Letting a team play and forgiving what they owe are two
  decisions, not one.
- **Organizer-registered teams** — `organizer_register_team`, separate from
  `register_team` because the authorization is inverted (an admin creating a
  team for people who may not have accounts, rather than a caller registering
  themselves). The first listed email is invited as CAPTAIN, which is the case
  `teams.captain_user_id` was made nullable for. Capacity and payment gating
  still bind the organizer; the public gates (deadline, open/closed) don't.
- **Payments dashboard** — a Server Component on both organizer pages. Totals
  (collected, outstanding, tax, refunded) plus a per-team row sorted by who
  needs chasing, not alphabetically. `lib/payments/ledger.ts` does the rollup,
  pure and unit-tested.
- **Payment links** point at the TEAM PAGE, never at a Stripe URL — a Checkout
  session dies within 24 hours, which is useless in an inbox. The team page
  mints a fresh session on click.
- **Three transactional emails**: payment request, receipt, refund notice. No
  unsubscribe footers — money owed, taken and returned isn't marketing. The
  receipt exists because Stripe's own can't answer the question a captain has
  after paying a split fee: is the TEAM covered yet.
- **A refund now reopens a balance** everywhere, including partially:
  `teamPaymentState` nets each charge down pro rata. Refunds also surface on
  `/profile/payments` with the organizer's reason.
- Extracted the money formatter that had been copy-pasted into five payment
  components into `lib/payments/format.ts`.

**Verified against the live database** in rolled-back transactions — 21 checks:
both constraints refuse what they should, `admit_team_unpaid` refuses an
anonymous caller and is a no-op on an already-active team, and
`organizer_register_team` refuses a non-admin, makes the first listed existing
user the captain immediately, leaves someone without an account as a pending
invite, and still hits the capacity cap ("all 19 spots have been taken").

**Tests:** 729 passing across 64 files (up from 692/62). tsc, eslint, prettier
and `next build` all clean.

**Not done, and deliberately:** a refund does NOT demote a confirmed team back
to `pending_payment`. Mid-season that would silently pull them out of pools,
schedules and standings — destructive, and never what a goodwill refund means.
The balance reappears on the dashboard and the organizer decides.

**Next:** go-live — live Stripe keys, real (non-test) Connect onboarding, and
TOS / refund / surcharge disclosure copy.

---

## 2026-08-12 (later) — Payments Slice B: paid registration, end to end

**Shipped.** Money now moves. An organizer prices an event, a captain pays (or
splits it across the team), and the team isn't admitted to play until it's paid.

- **B1 — fee at the event** (`af61c7d`, migration `0063`): `platform_fee_settings`
  (singleton, 1% / $3 / $20) + `competition_payment_settings`. Organizers set a
  price from the league/tournament page; `RegistrationFeeCard` shows the
  pass-through math so nobody is surprised by the total.
- **B2 — Checkout** (`f9cddb2`, migration `0064`): destination charges with an
  application fee, the `registration_payments` ledger, and the
  `checkout.session.completed` webhook. Two **partial unique indexes** permit
  only one *open* charge per payer — that's what stops a double-clicked "Pay
  now" billing twice. Plan math is pure in `lib/payments/registration-plan.ts`.
- **B3 — split payments** (`6e59e41`): each player pays their own share; the
  team confirms when the shares complete. `ShareList` shows who's paid.
- **Wizard restructure + price at creation** (`7c39676`): pricing is a step in
  the tournament wizard, not an afterthought. Added a venue autocomplete.
- **Max teams** (`a97b453`, migration `0065`): a nullable cap; counting happens
  *inside* the SECURITY DEFINER function that inserts, so two captains racing
  for the last spot can't both get in.
- **Payment-gated registration** (`b34e59c`, migration `0066`): new
  `pending_payment` team status. The migration was the easy half — **8 team
  queries** now exclude pending teams from play (pools, schedules, brackets,
  standings). Organizer lists deliberately still show them; that's how you chase
  them.
- **Captain picks the payment mode at registration** (`4025db7`).
- **Player payments page** (`4a39961`, migration `0067`): `/profile/payments`.
  `payer_user_id` is stamped from `auth.uid()` inside the SECURITY DEFINER
  function — a parameter could be forged and the settling webhook has no user
  context.

**Also shipped the same day**, unrelated to payments:

- **Missing-score reminder** (`9477003`): a daily cron nudges captains when a
  league game has no score.
- **Organizer broadcasts** (`31a5a66`, migrations `0068` + `0069`): organizers
  message their players, with an `org_messages` audit log that stores a
  recipient *count*, never the address list. This also fixed a real bug —
  `unsubscribe(_token)` only ever set `notify_weekly`, so every opt-out link
  switched off the digest and kept sending whatever the reader objected to.
  Now it takes a `kind`. **Email footers must pass `?kind=`.**

**Tests:** 692 passing across 62 files. All migrations through `0069` verified
applied against the live database.

**Next:** Slice C — organizer payment management (partial-payment approval,
register-a-team + payment link, refunds, payments dashboard, receipts).

---

## 2026-08-12 — Payments Slice A: Stripe Connect Express onboarding

**Shipped.** Organizers can connect a Stripe account and the app tracks whether
they can be paid. No money moves yet.

- Added the `stripe` SDK (v22.5.0) — the first new dependency in a while, and
  unavoidable for any Connect call.
- `lib/payments/stripe.ts` — lazily built, memoised platform client, so a
  deployment without keys degrades to "payments not switched on" instead of
  crashing at boot.
- `lib/payments/account-sync.ts` — pure `Stripe.Account` → `payment_accounts`
  mapping (8 unit tests). Stores a *count* of outstanding requirements rather
  than the list, which names individuals.
- `startPayoutsOnboardingAction` — create-or-reuse the Express account, then an
  onboarding link; a **login link** once details are submitted, so the card's
  "Manage on Stripe" CTA isn't a dead end.
- `app/api/webhooks/stripe` — signature-verified `account.updated` handler; the
  only write path for capability flags.
- Migration **`0060`** applied to Supabase (it had been written weeks earlier and
  parked awaiting keys).

**Verified in production**, not just locally: a real Express account onboarded
through the deployed site, 10 `account.updated` events delivered, and the DB row
an exact match for Stripe's own account object.

**Two things cost real time**, both recorded in `HANDOFF.md`: Stripe treats a
3xx redirect on a webhook as a failed delivery (our apex domain redirects to
`www`), and connected-account events are invisible to `stripe.events.list()`
unless you pass the account context.

**Next:** Slice B — paid registration. Plan in
`docs/plans/registration-payments.md`.
