# Registration payments — "Collect fees online, pay out to organizers"

> **Status: PLANNED, not started** (documented 2026-07-23). Design captured from
> a discovery conversation with the owner; no code written. Payments are a **v1**
> feature per `PRD.md` §4 (out of v0) and §14 (monetization). Pick up at
> "Phase 1" below when the owner decides to proceed. **Nothing here is built.**

## Context

Today organizers chase registration fees manually — cash or Interac e-transfer —
and reconcile by hand. This feature lets a team **pay the registration fee online
at the moment they register**, routes the money to the organizer's own bank via
**Stripe Connect**, and (optionally) takes a small platform fee. The owner's framing,
which the design should preserve:

- **The real win is timing, not the card option.** Collecting at registration —
  ideally *gating* a team's confirmation/schedule spot on payment — is what kills
  the chasing. Card convenience is a bonus on top.
- **Online payment is additive, offered *alongside* cash/e-transfer, not instead.**
  E-transfer is free in Canada; cards cost ~3%. Forcing cards taxes the reliable
  payers. Offer "pay by card" for people who are short on cash or want it instant,
  and keep the free methods for everyone else.
- **Refund policy must be explicit up front** — collecting early creates a
  drop-out question that causes disputes if it's fuzzy.

PRD §14 already sanctions the model: *"Free for organizers, always. Player
registration fee $1–2 baked into the price. Stripe Connect for payouts."*

## Architecture: Stripe Connect

Because money must reach **many different organizers** (not one platform bank
account), the standard tool is **Stripe Connect**:

1. Each organizer **connects a Stripe account** (one-time onboarding — Stripe
   collects their bank + identity for payouts and handles KYC).
2. A team pays the fee via **Stripe-hosted Checkout** on the registration flow.
   We never touch card numbers (Stripe is PCI-compliant; the app stays out of scope).
3. Stripe routes the charge to **that organizer's** connected account, minus
   Stripe's fee and minus the platform application fee.
4. Stripe pays out to the organizer's bank on a schedule; refunds flow back through
   the same rails.

**Connect account type — a required decision.** Express (Stripe-hosted onboarding
+ dashboard, Stripe handles disputes/tax forms; simplest for us) vs Standard
(organizer has a full Stripe account) vs Custom (we build everything; most work).
**Recommendation: Express** — least build, Stripe owns the compliance surface.

## The fee model

Three layers come out of each payment:

- **Stripe processing:** ~**2.9% + C$0.30** per card charge (Canada; confirm live
  rates at build time). Online Visa/MC **debit** runs the same card rate. Interac
  online is a separate method if we choose to add it.
- **Platform fee:** PRD's plan is a **$1–2 per registration** application fee
  (organizers stay free otherwise). Configurable; can be $0 to start.
- **Remainder → organizer.**

**Absorb vs pass-through — the core lever** (determines whether the organizer nets
what they expect):

- *Absorb:* team pays $50, organizer nets ~$48.20. Simple, organizer eats the fee.
- *Pass-through (recommended default):* fee added on top so the organizer nets
  exactly their target. Gross-up formula:

  ```
  charge = (payout_target + platform_fee + 0.30) / (1 − 0.029)
  ```

  Worked example — organizer wants **$60/team**, $1 platform fee, pass-through:
  subtotal $61 → grossed up **$63.10** charged to the team. Stripe takes ~$2.13,
  platform takes $1, **organizer receives $60.** Team sees "$60.00 + $3.10 fees."

Make absorb-vs-pass-through a per-competition setting; default pass-through.

## Payout timing (what to tell organizers)

- **First payout:** one-time **~7–14 day** hold after an account's first charge
  (Stripe fraud protection). Only happens once — surface it in onboarding so it
  doesn't surprise anyone.
- **Standard rolling payout (free default):** ~**2 business days** after a charge;
  schedule configurable (daily/weekly/monthly).
- **Instant Payouts (optional, ~1.5% fee):** to an eligible debit card in ~30 min,
  24/7. For the organizer who wants same-day cash.

Even the free 2-day path beats chasing e-transfers for weeks; instant is there for
those who want it. Exact windows/fees are Stripe's current terms — confirm at build.

## Phasing (test-mode slice first, widen later)

- **Phase 1 (thin slice, Stripe test mode):** Express Connect onboarding for ONE
  organizer + a **paid tournament registration** end-to-end in test mode (fake
  cards, no real money). Proves the whole flow before committing. Pass-through fee,
  fixed price, no refunds yet. Registration isn't confirmed until Checkout succeeds.
- **Phase 2:** Refunds (organizer-initiated + drop-out flow, honoring the refund
  policy setting), the organizer **payments dashboard** (who paid, totals, payout
  status), and webhooks hardened (idempotent, signature-verified).
- **Phase 3:** Leagues (currently no registration flow at all — see below), the
  cash/e-transfer "mark as paid manually" option alongside card, and go-live
  (real keys, real Connect onboarding, TOS/refund copy).

## Prerequisites in the app

- **Tournaments** already have a registration flow (`registerTeamAction` →
  `register_team` RPC, public page gated on `status='open'` + deadline). Payment
  slots in at that step: registration becomes "unpaid" until Checkout completes.
- **Leagues have no registration flow today** (organizer-add only). Charging for a
  league needs either league self-registration first, or a "send a payment
  request" flow to captains. Scope this in Phase 3.
- New tables (sketch): `payment_accounts` (organizer ↔ Stripe account id, status),
  `registration_payments` (team, amount, fee breakdown, status, stripe ids,
  refund state). Never store card data — only Stripe ids and amounts.
- New env vars: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID` (test + live sets).
- New dependency: `stripe` (Node SDK) — justified per CLAUDE.md (no way around it).
- Webhook route under `app/api/webhooks/stripe/` (the one sanctioned API-route use).

## What the owner needs to provide to proceed

**Accounts & access**
1. A **Stripe account for the platform** (mysportsapp) with **Connect enabled**,
   registered to a business entity or individual (Stripe requires this for the
   platform account). Test-mode keys are enough to start Phase 1.
2. The four **Stripe API keys/ids** above (test set first; live set at go-live).

**Business decisions (block the build until decided)**
3. **Platform fee:** flat $ per registration, a %, or $0 to start?
4. **Fee model default:** pass-through (organizer nets target) vs absorb — and is
   it a per-competition choice or platform-wide?
5. **Connect account type:** Express (recommended) vs Standard.
6. **Refund policy default:** e.g. "full refund before schedule generated, none
   after"; is the processing fee refundable? Who can issue refunds?
7. **Currency:** CAD confirmed? Any multi-currency need?
8. **Pricing granularity:** per-**team** or per-**player**? (Tournaments are
   team-registered today, so per-team is the natural fit.)

**Legal / compliance (needed for go-live, not Phase 1 test mode)**
9. **Terms of service + refund policy copy** covering payments.
10. **Tax stance:** is GST/HST on registration fees the organizer's responsibility
    (likely) or does the platform collect/remit? Needs a definitive answer before
    real money moves.

Phase 1 (test mode) only needs items **1–2** and provisional answers to **3–5**;
the rest can firm up before go-live.
