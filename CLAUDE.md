# CLAUDE.md

> Read this file fully at the start of every session. It is the source of truth for how to work in this codebase. The product spec lives in `PRD.md` (read it once per session for context).

---

## What this project is

A volleyball management web app for organizers and players. Free for organizers; built for the Toronto volleyball community. Supports leagues and tournaments for indoor 6s, beach 2s, and co-ed 4s. See `PRD.md` for full vision and v0 scope.

---

## Operating rules

1. **Always read `PRD.md` and this file at the start of a session.** Do not skip.
2. **Work in vertical slices.** One feature end-to-end per session — schema → server action → UI → test. Never half-build something across two sessions.
3. **Commit before changing topics.** Small, descriptive commits. Branch per feature.
4. **Ask before broad refactors.** If you're about to touch more than 10 files for a non-feature reason, stop and ask.
5. **When uncertain about volleyball domain rules (formats, scoring, tiebreakers), refer to `PRD.md` Sections 6 and 8. Do not invent rules.**
6. **Do not add dependencies casually.** Justify any new package in your message.

---

## Tech stack

- **Next.js 15** (App Router, TypeScript strict)
- **Tailwind CSS v4** + **shadcn/ui**
- **Supabase** (Postgres, Auth, Storage)
- **Drizzle ORM** (schema, migrations, queries)
- **Resend** (transactional email)
- **react-hook-form + zod** (forms + validation)
- **date-fns + luxon** (dates, timezones)
- **Vitest** (unit tests) + **Playwright** (E2E)
- **Vercel** (hosting)

Do not introduce Redux, Zustand, tRPC, GraphQL, Prisma, or any other stack-level alternative without explicit approval.

---

## Directory conventions

```
app/          # Next.js routes. (public)/, (auth)/, (app)/ route groups.
components/   # React components. ui/ is shadcn primitives. Feature folders below it.
lib/          # Pure logic. db/, scheduler/, auth/, email/, utils/.
server/       # Server-only code. actions/ holds Server Actions grouped by domain.
types/        # Shared TS types.
tests/        # Vitest unit tests mirror lib/ structure. Playwright tests in tests/e2e/.
```

- **Server Components by default.** Mark `"use client"` only when necessary (event handlers, browser APIs, hooks like useState).
- **Server Actions for all mutations.** Located in `server/actions/<domain>.ts`. Each exports named async functions; never default exports.
- **No API routes** except for webhooks (`app/api/webhooks/*`).
- **Database access only from server code.** Never import Drizzle in a client component.

---

## Code style

- TypeScript **strict mode** is on. Resolve all type errors before finishing a task. No `any` without a comment explaining why.
- Use `import type { ... }` for type-only imports.
- Prefer **named exports** over default exports (easier to grep/refactor).
- File names: `kebab-case.ts` for code, `PascalCase.tsx` for React components.
- Component prop types defined inline with the component when small; in a separate `types.ts` if reused.
- Keep functions short. Extract pure logic to `lib/` so it can be unit-tested without mounting a component.
- Comments: explain **why**, not **what**. The code already says what.

---

## Database & schema rules

- The Drizzle schema in `lib/db/schema.ts` is the source of truth. Mirror enums and types from there; don't redefine them.
- **Every schema change requires a migration.** Use `drizzle-kit generate`.
- RLS policies live alongside migrations in `lib/db/migrations/`. Never bypass RLS by using the Supabase **secret key** (`SUPABASE_SECRET_KEY`, the `sb_secret_...` value) in app code — it's only for trusted server jobs like cron. The **publishable key** (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, the `sb_publishable_...` value) is the low-privilege client key and respects RLS.
- Foreign keys with `onDelete: 'cascade'` only when truly intended; otherwise restrict.
- All timestamps are `TIMESTAMPTZ`. Store UTC; convert to the competition's venue timezone in the UI using luxon.
- Standings are **never the source of truth** — always derive from `matches` + `sets` via `lib/scheduler/tiebreakers.ts`. The `standings_cache` table is purely a cache.

---

## Scheduler & domain logic

All scheduling algorithms live in `lib/scheduler/` as **pure functions** with no DB access. They take plain inputs and return plain outputs. This is non-negotiable — it's what makes them testable.

- `round-robin.ts` — league schedule generation
- `pools.ts` — tournament pool assignment + intra-pool scheduling
- `bracket.ts` — single-elimination bracket seeding
- `tiebreakers.ts` — standings ordering with the OVA hierarchy

Every change to these files must come with updated unit tests in `tests/scheduler/`.

---

## Testing rules

- **Scheduler code: full unit tests required.** Aim for ≥90% coverage. Include edge cases: odd team counts, byes, 3-way ties, forfeits.
- **Server Actions: integration tests** using a test Supabase instance. Don't mock the DB for these.
- **UI: visual + interaction tests for critical flows only** (score entry, schedule generation). Don't waste tokens unit-testing trivial components.
- Run `npm test` before declaring a session "done."

---

## UI rules

- Light & airy aesthetic. Inspirations: CBVA, myteam.click. See `PRD.md` Section 11 for tokens.
- Use shadcn/ui components — don't build buttons, dialogs, dropdowns from scratch.
- Standings tables: `font-variant-numeric: tabular-nums` always.
- Mobile-first. Test every UI at 375px width before declaring done.
- Forms always use react-hook-form + zod. Always show inline validation errors.
- Loading states: use shadcn's `Skeleton` component. Never show a blank screen.
- Empty states: thoughtful copy + a clear primary action. Never an empty box.

---

## Email rules

- All emails go through Resend.
- Templates live in `lib/email/templates/` as React components (`@react-email/components`).
- Always send from a `noreply@` address but include a reply-to of the organizer's email where appropriate.
- Include unsubscribe links on digest emails (legal requirement).

---

## Security & privacy

- **RLS is the primary authorization layer.** Server Actions are defense in depth, not the only line.
- **Supabase uses the new API key system** (publishable + secret keys), not the legacy anon/service_role JWT keys. Use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the `sb_publishable_...` value) for the browser/client Supabase instance, and `SUPABASE_SECRET_KEY` (the `sb_secret_...` value) only in trusted server contexts. The publishable key is low-privilege and respects RLS; the secret key bypasses RLS and must never reach the client.
- **Never log PII** (emails, names) to console.log in production. Use structured logging if needed.
- Validate every Server Action input with zod. Reject anything that doesn't conform.
- Sanitize any user-provided HTML (we don't allow rich text in v0, so this should be a non-issue — keep it that way).
- Stripe will be added in v1; do not store payment info ever (use Stripe Customer IDs).

---

## Environment variables

Local secrets live in `.env.local` (gitignored). A committed `.env.example` mirrors the keys with placeholder values. **Supabase is on the new API key system** — use the publishable/secret naming, not the legacy anon/service_role naming.

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://evngfeuqyllfwkdvsrsb.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # client-side, low-privilege, respects RLS
SUPABASE_SECRET_KEY=sb_secret_...                         # server-only, bypasses RLS — never expose to client

# Database (Drizzle connects directly via the transaction pooler)
DATABASE_URL=postgresql://postgres.evngfeuqyllfwkdvsrsb:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres

# Email (added in Phase 9)
RESEND_API_KEY=re_...

# AI features (added post-v0, Phase 12+)
ANTHROPIC_API_KEY=sk-ant-...
```

- The Supabase client (`@supabase/supabase-js` / `@supabase/ssr`) uses the URL + publishable key for auth and RLS-protected reads.
- Drizzle uses `DATABASE_URL` to talk to Postgres directly.
- Never read `SUPABASE_SECRET_KEY` from a client component or a `NEXT_PUBLIC_`-prefixed variable.

## Common commands

```bash
# Install
npm install

# Dev server
npm run dev

# Generate Drizzle migration after editing schema.ts
npm run db:generate

# Apply migration to Supabase
npm run db:migrate

# Open Drizzle Studio
npm run db:studio

# Run tests
npm test                # all
npm test -- scheduler   # just the scheduler

# Lint & format
npm run lint
npm run format

# Build (catch type errors)
npm run build
```

---

## What NOT to do

- ❌ Do not add features outside the v0 scope listed in `PRD.md` Section 4. If you have an idea, write it in `IDEAS.md`.
- ❌ Do not generate code without first reading `PRD.md` and this file.
- ❌ Do not invent volleyball rules. Refer to the PRD sections on formats and tiebreakers.
- ❌ Do not change the tech stack without a written ADR (architecture decision record) in `docs/adr/`.
- ❌ Do not bypass RLS or use the Supabase secret key (`SUPABASE_SECRET_KEY`) in user-facing code paths.
- ❌ Do not write 300-line React components. Split them.
- ❌ Do not skip tests for scheduler/tiebreaker code. Ever.

---

## How to start a feature

1. Re-read `PRD.md` (the section relevant to the feature).
2. Re-read this file.
3. Write a 5-bullet plan in the session: data model changes, server actions, UI components, tests, migration steps.
4. Get to work in this order: schema → migration → pure logic + tests → server action → UI → manual test.
5. Commit with a descriptive message.
6. Update `PROGRESS.md` (a simple log of what shipped in each session).

---

## Glossary (volleyball-specific)

- **Pool**: a group of teams in a tournament that play each other round-robin before the bracket.
- **Bracket**: the single-elimination tree played after pools.
- **MW / ML**: matches won / lost.
- **SW / SL**: sets won / lost.
- **PF / PA**: points for / against.
- **Set ratio**: SW / SL.
- **Point ratio**: PF / PA.
- **Round-robin**: every team plays every other team.
- **Snake draft / serpentine**: pool assignment that distributes seeds evenly (1→A, 2→B, 3→C, 4→D, 5→D, 6→C, …).
- **Match format notation** like `2x15 + 1x11@45'`: two sets to 15 + one tiebreaker set to 11, capped at 45 minutes.
