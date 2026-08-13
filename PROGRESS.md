# Progress

A log of what shipped each session. Newest first. Detail on current state and
gotchas lives in `HANDOFF.md`; this file is the "what happened when".

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
