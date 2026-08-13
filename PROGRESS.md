# Progress

A log of what shipped each session. Newest first. Detail on current state and
gotchas lives in `HANDOFF.md`; this file is the "what happened when".

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
