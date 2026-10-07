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

Tournament-side only; leagues (Big Shoots, BVL) are unaffected.

**The prerequisite bug is fixed** (2026-09-16, migration 0123):
`place_bracket_winner` now has the `bracket_track` predicate it was missing. But
that same migration added something double elim must respect — brackets are
scoped **by division** (`matches.division_id`), so the generator, the loser
routing and the `final_round` lookup all have to carry the division through
alongside the track.

And `place_bracket_winner` is now **five migrations deep** — 0013 (winners), 0026
(track), 0094 (3rd-place game), 0099 (placement + first-round loser routing),
0123 (division). A double-elim rewrite of it must carry every one of those
forward; 0123's first draft was written from the 0013 text, dropped three of
them, and reached prod that way before being caught. `lib/db/apply-0123.ts`
asserts each behaviour by name — copy that pattern. See HANDOFF "Known quirks".

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

## Mobile app — players and organizers, "the league in your pocket"

**Status:** the owner is **strongly considering a full React Native app for
both players and organizers** (2026-10-07). The earlier plan (2026-09-29) was
players only, ~Nov–Dec 2026 once leagues pay, organizers staying on the web.
Not started. Needs an ADR before any code — it is a stack addition.

**Why:** push notifications above all — "you play 6:15, Court a, Turner
Fenton", "confirm your score", "schedule changed", "you moved up to Tier 2".
Email is ignored. Then: one tap to tonight, tonight's schedule readable in a
gym with no signal, score entry courtside, and app-store presence. Organizers
run game night from a phone (scores, forfeits, a court that closed) — that is
the part of their job worth putting in an app.

### Shape

- **Expo + React Native, TypeScript strict**, iOS and Android from one
  codebase. Expo's push service; over-the-air updates for JS-only fixes.
- **Same Supabase project and accounts.** The app signs in with the
  publishable key and the user's session, so **RLS stays the authority** —
  which is what makes this viable without re-auditing permissions. Never the
  secret key on a device.
- **Mutations need an API.** Server Actions can't be called from a native app,
  and CLAUDE.md allows no API routes except webhooks — the ADR must change that
  rule: `app/api/v1/*` route handlers, Supabase JWT as a bearer token, zod on
  every input, calling the SAME server-side functions the web's actions call.
  Extract each action's body into `server/` first so web and app can't drift.
  Reads can go straight to Supabase where RLS already gates them.
- **Shared logic, not copied.** `lib/` pure code (score validation, formats,
  tiebreakers, tier ordering, date/timezone helpers) moves into a workspace
  package both apps import. The monorepo (npm workspaces) is part of the ADR.

### Players — v1

- Sign in with the same account as the web; accept team invites.
- **My games:** next game first — night, gym, court, time, ref duty, opponent —
  then the rest of the season.
- League schedule in the league's chosen views (`schedule_views`, 0158),
  standings, team roster.
- **Enter and confirm scores** under the web's rules (who may enter, the
  future-lock, confirmation).
- Sign the org's waiver; see what's still missing (details, waiver, payment).
- **Push:** next game (evening before + 2 h before), a score waiting for your
  confirmation, schedule changed, tier move after a ladder lock, playoffs
  drawn. Per-type opt-out beside the email preferences.
- **Offline:** my games and tonight's full schedule cached.
- **Payment:** a link out to the existing Stripe Checkout. League fees are a
  real-world service, so app-store in-app-purchase rules don't apply — keep it
  a link, not an in-app wallet.

### Organizers — v1 (game night, not setup)

- **Tonight:** every game of the night by tier/court, live, showing what's
  scored and what's missing.
- Enter / fix any score, mark a forfeit, clear a mistaken result — all into
  the audit trail (an edit lands only on submit; fixed 2026-10-07).
- Move a game's time or court; swap two teams within a night (the Mango Oct 6
  fix, which had to be done by hand).
- Lock the ladder week / round once the night is in.
- Rosters at a glance: who's on each team, who hasn't signed the waiver or
  paid.
- Record an offline payment (e-transfer / cash).
- Push an announcement to a league or a tier ("Gym closed, games moved to …").

**Stays on the web:** creating leagues and tournaments, registration forms and
questions, tier setup, generating/drawing schedules, payments setup (Stripe
Connect), gym permits, settings and history, bulk email, refunds, deleting
anything.

**Not in v1:** in-app chat, the AI assistant (next entry), bracket editing,
tournament check-in.

### What it takes

- **ADR** in `docs/adr/`: Expo, monorepo, the API-route exception.
- **Server work first:** extract actions into shared server functions; the v1
  API; a push-token table and sender (Expo push); notification preferences.
- **Store requirements:** Apple Developer $99/yr, Google Play $25 once; in-app
  account deletion (Apple requires it); Sign in with Apple if any other social
  login is offered; privacy policy and store privacy labels; review test
  accounts.
- **Time, honestly:** ~6–10 weeks for both roles to a store release, in
  slices, each shippable alone: (0) ADR + API extraction → (1) players
  read-only + push → (2) score entry/confirm → (3) organizer game night →
  (4) store release. Pilot with one league (Mango Coed or SMVA).

### Cheaper alternatives, if the cost bites

1. **Installable web app + web push** (~1–2 weeks). `app/manifest.ts` and the
   192/512 icons exist; missing is a service worker, push subscriptions and
   preferences. iPhone needs "Add to Home Screen" (iOS 16.4+). No stack change.
2. **Capacitor shell** around the existing Next.js pages (+1–2 weeks) with
   native push. Apple rejects thin wrappers — push + offline is what makes it
   more than one. Still an ADR.

Native costs the most because every screen is built a second time. What it
buys is a genuinely native feel, dependable push and offline, and organizer
game-night screens designed for a phone rather than adapted to one.

### Open decisions

- Native (Expo) vs Capacitor shell vs web push first — the cost/feel trade.
- Organizers in the same app (role-based screens) at launch, or a later slice.
- Which league pilots it; which push notifications go out first.

## AI assistant for organizers — "check and confirm, small fixes only"

**Status:** idea, owner asked 2026-10-07. Not started. Deliberately cuts
against PRD §1 ("No chatbots in corners") and §13 (AI is post-v0) — a scope
call to make on purpose before building.

**Why:** most organizer support today is questions answered by hand ("has
Bryan signed the waiver?", "who changed the deadline?", "which scores were
edited?", "why does Tier 4 show 12 games?") and small fixes ("extend
registration to Friday", "record Brianna's e-transfer"). An assistant that can
look these up and make the small ones removes real work — the PRD's own test.

**Shape:** an "Ask" panel on organizer pages, scoped to the current org.
Claude via the Anthropic API with tool use. Each tool is a thin wrapper over
an existing query or server action, run **as the signed-in organizer** — RLS
and the actions' zod validation apply, so it can never do more than the
organizer could by hand. Uses `ANTHROPIC_API_KEY` (already reserved in the env
list) and one new package, the Anthropic SDK — justify it in the PR.

**Read (answered directly):** who's unpaid, unsigned or missing details; the
schedule for a night, tier or team; standings; registration status and
deadline; settings history (who changed what, when); the score audit (what was
edited); roster questions ("is Brianna on a team?").

**Small changes — always a confirmation card; nothing runs until the
organizer taps Confirm:** extend or close a registration deadline; record an
offline payment; enter or fix a score; move one game's time or court; resend
an invite or waiver request; rename a team; add or remove a player on a
roster.

**Never (it points to the right page, or to the platform owner):** generate,
draw, redraw, lock or unlock schedules; delete anything; refunds; Stripe or
payout settings; bulk emails; changing tiers or formats; anything across orgs.

**Guardrails:** every change lands in the existing trails (`match_audit`,
`settings_changes`) under the organizer's name; conversations are logged; a
per-org daily cap on calls; no PII in logs; the model never sees the secret
key or another org's data.

**Cost:** a few cents per conversation on a small model, capped per org.

**Phases:** (1) read-only "Ask", piloted with Mango or Helix (~1 session);
(2) confirmed small changes, one action at a time, most-requested first.

**Open:** which org pilots it; whether players later get a read-only version
(their games, waiver, payment); whether it ships in the mobile app too.
