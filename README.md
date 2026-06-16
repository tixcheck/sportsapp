# sportsapp

A volleyball management web app for organizers and players in Toronto — leagues
and tournaments for indoor 6s, beach 2s, and co-ed 4s. Free for organizers.
Built to feel like a community tool, not a SaaS dashboard.

Players show up and play: see their next match, enter scores, check standings.
Organizers get relief from the boring stuff — scheduling, standings, and
reminders happen for them, with real tiebreaker logic (no fudging).

See [`PRD.md`](./PRD.md) for the full product spec and [`CLAUDE.md`](./CLAUDE.md)
for how to work in this codebase.

## Tech stack

- **Next.js 15** (App Router, TypeScript strict) + **Tailwind CSS v4** + **shadcn/ui**
- **Supabase** (Postgres, Auth, Storage) with **Drizzle ORM** for schema/migrations/queries
- **Resend** (transactional email), **react-hook-form + zod** (forms/validation)
- **date-fns + luxon** (dates/timezones)
- **Vitest** (unit) + **Playwright** (E2E), deployed on **Vercel**

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local   # then fill in real Supabase / Resend values

# 3. Run the dev server
npm run dev                  # http://localhost:3000
```

## Common commands

```bash
npm run dev          # dev server (Turbopack)
npm run build        # production build (also type-checks)
npm run lint         # ESLint
npm run format       # Prettier (write); format:check to verify
npm run db:generate  # generate a Drizzle migration after editing lib/db/schema.ts
npm run db:migrate   # apply migrations to Supabase
npm run db:studio    # open Drizzle Studio
```

A Husky pre-commit hook runs `format:check` and `lint` before every commit.

## Project structure

```
app/          Next.js routes — (public)/, (auth)/, (app)/ route groups; api/ for webhooks
components/   React components — ui/ is shadcn primitives; feature folders below
lib/          Pure logic — db/, scheduler/, auth/, email/, utils/
server/       Server-only code — actions/ holds Server Actions by domain
types/        Shared TS types
tests/        Vitest unit tests (mirror lib/) and Playwright E2E (tests/e2e/)
```

> Status: **Phase 0 (scaffolding) complete.** Data model and migrations land in
> Phase 1 — see `PRD.md` Section 12 for the build roadmap.
