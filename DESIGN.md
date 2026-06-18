# Design System — Volleyball Platform

> Brief: **"Ink & Paper" — premium editorial, grounded in volleyball, warm but refined.** A warm paper base and near-black ink, set like a leather-bound sports almanac: spacious, hairline-ruled, confident. An evolution of the old warm palette — not a cold pivot — but more editorial and disciplined than Sunset Sand. The numbers are the beautiful thing: standings read as a newspaper league table, scorelines as a published match report. This file is the source of truth for visual identity. Every screen derives its color, type, and spacing from these tokens.

---

## 1. Design thesis

The app should feel like **a sports almanac or the results page of a good newspaper** — warm paper, dark ink, generous margins, hairline rules, and data set with care. Refined and trustworthy, not a SaaS dashboard and not a cold broadsheet. The chrome is quiet so the **data carries the personality**: a league table you could frame, a match report you'd read aloud.

**Spend boldness in one place:** the **data itself** — the almanac standings table and the published-scoreline match report. The set tally renders in large serif numerals like a printed result; everything around it stays ink-on-paper quiet. A beach organizer must read it on a phone in direct sunlight, so glanceability is never sacrificed for editorial mood.

**The one risk we take, deliberately:** a loss is rendered in **muted ink, not red.** Almanacs bold the wins and let the losses recede. This frees red entirely for the brand's single spot color (claret), and it's why we don't use a stoplight palette.

---

## 2. Color palette

Warm paper + warm near-black ink + **one** spot color (claret) + **one** narrow semantic (pine). Named tokens map to CSS variables (§10).

### Paper + ink (the page)
| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F1E9D9` | App background — warm paper (deeper/warmer than the cream cliché) |
| `--paper-raised` | `#FAF5EA` | Cards, sheets, tables, the match report |
| `--paper-sunken` | `#E7DCC6` | Zebra rows, fills, the "your team" row, sunken controls |
| `--ink` | `#1C1714` | Primary text **and data** — warm near-black |
| `--ink-2` | `#6A5F52` | Secondary text, datelines, table headers |
| `--ink-3` | `#9B9082` | Tertiary, captions, placeholders, **and a loss** (muted — no red) |
| `--rule` | `#D8CCB4` | Hairline rules and borders (the structural workhorse) |

### Claret — the one spot color (used with restraint)
| Token | Hex | Use |
|---|---|---|
| `--claret` | `#8E2C3B` | Accent: active tab, links, pool leader, "Final"/live mark, winner's scoreline, destructive actions |
| `--claret-deep` | `#6C1F2C` | Hover / pressed / deep emphasis |
| `--claret-tint` | `#F0DCD9` | Faint claret wash — selected/hover row, the tiebreaker pill hover, "my team" affordances |

### Pine — one semantic only
| Token | Hex | Use |
|---|---|---|
| `--pine` | `#2F6B43` | **Only** "advances to playoffs / qualified." Never decorative. |

**Discipline rules.**
- **Claret is a guest, not a wallpaper.** Aim for ≤4 claret elements per screen (e.g. active tab underline, leader rank, qualification cut, "Final"). If claret is everywhere, the design is broken.
- **Pine means exactly one thing:** a team advancing out of pool play. It is never a generic "good"/"win" color.
- **Loss = `--ink-3`.** No red for losses anywhere. Wins are shown by **weight** (bold ink) and, where relevant, the claret scoreline — not by a green/red pair.
- **Never color-code meaning alone** (§8): wins/losses also use W/L text and weight; "advances" also uses a label; status pills also use words.

---

## 3. Typography

A genuine newspaper pairing — **not** Fraunces + Inter. Three roles, two families.

### Display — **Newsreader** (serif)
A face built for news, with real character in its italics and terminals; optical sizing. Used with restraint for: page titles, section headers, team names in the match report, and the **large scoreline numerals**. Italic carries the editorial "voice": datelines and section notes.
- Weights: 400, 500, 600 (+ italic 400/500)
- Tight tracking on large sizes (`-0.01em`)
- Loaded via `next/font/google`, exposed as `--font-display`.

### Body / UI — **Libre Franklin** (sans)
A Franklin Gothic revival — the classic newspaper deck/caption sans. The workhorse: body copy, labels, buttons, tabs, navigation.
- Weights: 400, 500, 600, 700
- Exposed as `--font-sans`.

### Data — **Libre Franklin + tabular-lining figures**
**Data stays sans — this is a rule, not an omission.** The standings table, stat columns, and set-by-set scores use Libre Franklin with `font-variant-numeric: tabular-nums lining-nums`. A sans stays instantly glanceable on a phone in sunlight where a serif table would not, and Franklin Gothic is the historic results-table lineage. Columns must align; figures must be tabular everywhere numbers stack.

### The one serif-numeral exception — the scoreline
The **match set-tally** (e.g. `2`–`1`) renders in **Newsreader** at large size — serif figures read as a *published result*, the memorable moment. The set-by-set detail beneath it stays sans-tabular. This is the only place numerals leave the sans.

### Type scale (rem, 16px base)
| Token | Size | Line height | Use |
|---|---|---|---|
| `text-score` | 2.4rem / ~38px | 1.0 | Match-report set tally (serif) |
| `text-h1` | clamp(2rem → 2.9rem) | 1.04 | Tournament/page title (serif) |
| `text-h2` | 1.5rem / 24px | 1.1 | Section headers — "Standings", "Pool draw" (serif) |
| `text-h3` | 1.0625–1.15rem | 1.25 | Pool name, team in report (serif) |
| `text-base` | 1rem / 16px | 1.5 | Body (sans) |
| `text-sm` | 0.875rem / 14px | 1.45 | Table cells, secondary (sans) |
| `text-xs` | 0.72rem / ~11.5px | 1.4 | Eyebrows, labels, datelines (sans uppercase, or serif italic for the report dateline) |

---

## 4. Spacing, radius, shadow

Editorial means space and rules, not boxes and drop-shadows.

### Spacing
- Measure: `max-width: 60rem` for reading/data columns.
- Section rhythm: `3rem` between major sections; `1.25rem` from a section header to its content.
- Card padding: `1.1–1.4rem`.
- **Table row height: 44px** (`h-11`/`2.85rem`) — comfortable taps in sunlight; tabular figures vertically centered.

### Radius (crisp, not the cold zero-radius broadsheet)
| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 4px | Inputs, tags, small controls |
| `--radius` | 6px | **Default** — buttons, pills-that-aren't-round |
| `--radius-lg` | 10px | Cards, the match report, sheets |
| `--radius-full` | 9999px | Avatars, status dots, the tiebreaker rank button |

### Shadow (almost none — rules do the work)
| Token | Value |
|---|---|
| `--shadow-sm` | `0 1px 0 rgba(28,23,20,0.04)` |
| `--shadow-report` | `0 2px 18px rgba(28,23,20,0.07)` |

Elevation is a hairline `--rule` border, not a shadow. The **match report is the one card that lifts** (`--shadow-report`) because it's the "published" piece. Everything else is flat with rules.

---

## 5. Component conventions

Built on shadcn/ui — these are the customizations over the primitives.

- **Buttons.** Primary = `--claret` fill, near-white (`--paper-raised`) label, `--radius`; hover → `--claret-deep`. Secondary = `--paper-raised` fill, `--rule` border, `--ink` label. Ghost = `--ink-2` text, no border. Min height 44px on mobile.
- **Cards.** `--paper-raised` surface, `--rule` hairline border, `--radius-lg`, **no shadow** (flat). The match report is the exception (`--shadow-report`).
- **Standings table (the centerpiece).** See §6. Hairline-ruled rows, no card box, serif rank in the margin, sans-tabular stats, claret leader + qualification cut.
- **Status pills.** Scheduled = `--paper-sunken` / `--ink-2`. Live = claret outline + a soft pulsing `--claret` dot. Final = `--ink-2` (quiet). Disputed = `--claret-tint` / `--claret-deep`. Pending confirmation = `--paper-sunken` border + `--claret` text. All carry a word, never color alone.
- **Match report / score display.** See §6. Serif team names, serif set-tally (winner `--claret`, loser `--ink-3`), sans-tabular set-by-set with the dropped set muted, an italic one-line verdict.
- **Match card (schedule, compact).** Dateline eyebrow (court · time), team names, the result inline once final: serif set-tally on the right (winner `--claret`), set-by-set sans-tabular beneath; status pill. Scheduled cards show the time in tabular figures instead of a score.
- **Forms.** Inputs `--radius-sm`, `--rule` border, focus ring `--claret`. Validation errors in `--claret` `text-sm` **with an icon** (so error red is distinguishable from claret links by context + icon, not hue). Labels `text-sm` `--ink` `font-medium`.
- **Links.** `--claret`, underline on hover; never claret body paragraphs (reserve for true links/actions).
- **Empty states.** Centered, a quiet `--ink-3` icon, one line of plain copy, a single `--claret` primary action. Never an empty box.
- **Tabs.** Uppercase Libre Franklin, tracked. Active = `--ink` text + a 2px `--claret` bottom rule; inactive = `--ink-3`.
- **"My team" affordance.** A small claret-outline tag reading **"Your team"** (`--claret` text + border, `--radius-sm`). Distinct from pine (advances) and from bold-ink (a win) — it's an identity marker, not a result.
- **Bottom nav (mobile, Phase 10).** Active tab `--claret`, inactive `--ink-3`. `--paper-raised` surface, top hairline `--rule`.

---

## 6. The signature elements

Two treatments carry the whole identity. Everything else stays quiet so these land.

### 6.1 The almanac league table
Every app shows standings in a boxed table. Ours is set like a newspaper/almanac results table:
- **No card box** — the table sits on the page, rows separated by hairline `--rule`.
- **Rank in the margin** as a **Newsreader serif figure** (not a sans cell). The leader's rank is `--claret`.
- **The rank is the tappable tiebreaker affordance** (unchanged logic): a round button that washes `--claret-tint` on hover and opens the OVA-style explanation of how a tie was broken, with the exact ratios. This is the detail organizers will mention.
- **Stats** (`MW ML SW SL PF PA`, ratio) in Libre Franklin tabular-lining figures; `MW` bold ink; losses (`ML`, `SL`) in `--ink-3`.
- **The qualification cut** is drawn explicitly: advancing rows get a 2px `--claret` left tick and a claret rank; a labelled claret rule ("Top N advance to playoffs") separates them from the rest. The cut is information, not decoration.
- **"Your team" row** gets a `--paper-sunken` background + the claret "Your team" tag.

### 6.2 The match report
A finished match is presented like a published report, not a score cell:
- **Dateline:** a Newsreader-italic line ("Court 3 · Saturday, 11:20 a.m.") beside a `--claret`-outline **"Final"** pill.
- **Tale of the tape:** two rows — serif team name left, **large serif set-tally** right. Winner in `--claret`; loser in `--ink-3`. A hairline `--rule` between them.
- **Scorecard:** the set-by-set line in sans-tabular ("21–18 · 17–21 · 15–12"), with the set the loser took shown in `--ink-3`.
- **Verdict:** one Newsreader-italic sentence — "**Nguyen / Park** def. Côté / Walsh in three." Active voice, plain language, the winner bolded.

---

## 7. Motion

Restrained and purposeful — editorial calm, never bouncy.

- Transitions: 150–200ms ease-out. Tailwind defaults are fine.
- **Live match pulse:** the "Live" status dot gently pulses (`--claret`), 2s loop. The one ambient animation.
- **Score commit:** when a confirmed score lands, the affected standings row briefly washes `--claret-tint` and the changed figures tick up. Fast and satisfying.
- **Page transitions:** none heavy — instant navigation with skeletons, not spinners.
- Respect `prefers-reduced-motion`: disable the pulse and tick.

---

## 8. Accessibility floor (non-negotiable)

- Contrast: `--ink` on `--paper`/`--paper-raised` is far above AA. `--claret` on paper passes AA for normal text (it's a dark red); white/`--paper-raised` on `--claret` passes. `--pine` on paper passes. Verify `--ink-2` meets AA at its sizes; use `--ink` where in doubt.
- `--ink-3` is for tertiary text and the *loss* treatment only — never essential standalone information, and a loss is always also conveyed by weight + W/L text.
- **Don't encode meaning in color alone:** wins use weight + text; "advances" uses a label + the cut rule; status pills use words; the "your team" tag uses text.
- Visible keyboard focus rings (`--claret`) on every interactive element.
- Tap targets ≥44px on mobile (table rows included).
- The match-report and table must stay legible in bright sunlight — that's why data is high-contrast sans-tabular, not low-contrast serif.

---

## 9. Dark mode

Not in v0. The token structure (CSS variables) is built so a warm dark theme — deep ink-brown background, paper-colored text, claret accent — can be added later by overriding the palette under a `.dark` selector with no component rewrites. Deferred to post-v0 per PRD.

---

## 10. Implementation note for Claude Code

Apply tokens in `app/globals.css` as CSS custom properties under `:root`, exposed to Tailwind v4 via `@theme inline`, with shadcn's semantic tokens remapped onto the palette:

- `--background` → `--paper`, `--foreground` → `--ink`
- `--card` / `--popover` → `--paper-raised`, foreground → `--ink`
- `--primary` → `--claret`, `--primary-foreground` → `--paper-raised`
- `--secondary` / `--muted` → `--paper-sunken`, `--secondary-foreground` → `--ink`, `--muted-foreground` → `--ink-2`
- `--accent` → `--claret-tint`, `--accent-foreground` → `--claret-deep`
- `--destructive` → `--claret` (the single spot color carries destructive UI; pair with an icon — sport "loss" stays `--ink-3`)
- `--border` / `--input` → `--rule`
- `--ring` → `--claret`
- `--radius` → 6px (with `--radius-lg` 10px, `--radius-sm` 4px)
- Expose the named palette as utilities: `--color-paper*`, `--color-ink*`, `--color-rule`, `--color-claret*`, `--color-pine`, plus `--color-win`/`--color-loss` aliased to the above for any code that references them (`--win` → `--pine`, `--loss` → `--ink-3`).
- Shadows: emit `--shadow-sm` and `--shadow-report` only.

Fonts: load **Newsreader** (display, with italic + optical sizing) and **Libre Franklin** (body/data) via `next/font/google` in the root layout. Expose Newsreader as `--font-display` (headings, section titles, team names in the report, the scoreline) and Libre Franklin as `--font-sans` (everything else, with `tabular-nums lining-nums` for data).

The reference for the intended result is `design/ink-and-paper-hero.html` (the approved hero prototype).
