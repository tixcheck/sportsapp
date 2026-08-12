# Progress

A log of what shipped each session. Newest first. Detail on current state and
gotchas lives in `HANDOFF.md`; this file is the "what happened when".

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
