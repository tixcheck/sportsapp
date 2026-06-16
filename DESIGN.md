# Design System — Volleyball Platform

> Brief: **Warm & welcoming — "Sunset Sand."** Golden-hour energy on a beach court: coral-orange leading, apricot and gold supporting, on a warm cream background with espresso-brown text. Friendly and lively, never corporate, never a cold dashboard. Scores stay razor-sharp; the warmth lives in the chrome. This file is the source of truth for visual identity. Every screen from Phase 4 on derives its colors, type, and spacing from these tokens.

---

## 1. Design thesis

The app should feel like **a sand court at golden hour** — warm light, the sun still up, the energy of a game in full swing. Welcoming and human, not a SaaS dashboard and not a dark data terminal. The numbers (scores, standings) stay crisp and legible; the warm chrome around them makes the app feel inviting and alive.

**Spend boldness in one place:** the *score and standings typography* — big, confident, tabular numerals in burnt orange — is the signature. Everything else stays warm but quiet so the scores feel like a real scoreboard at sunset.

---

## 2. Color palette

Named tokens. These map to CSS variables (Section 6). Built on a coral/apricot core with espresso-brown text on warm cream surfaces.

### Brand — Coral (the protagonist)
| Token | Hex | Use |
|---|---|---|
| `--coral-50` | `#FCE5D4` | Faintest tint — hover backgrounds, selected rows |
| `--coral-100` | `#F8D0B4` | Light fills, badges, position pills |
| `--coral-200` | `#F5B896` | Borders on coral surfaces |
| `--coral-400` | `#F2814F` | Bright accent, highlights |
| `--coral-500` | `#E8643C` | **Primary** — buttons, links, active states |
| `--coral-600` | `#D2522C` | Primary hover / pressed |
| `--coral-700` | `#C2410C` | Primary text on light, signature score numerals |
| `--coral-900` | `#9A3D24` | Deep text on coral fills |

### Apricot + Gold (warm supports — energy, secondary accents)
| Token | Hex | Use |
|---|---|---|
| `--apricot-300` | `#F9C29A` | Soft warm fills |
| `--apricot-500` | `#F59E5B` | Secondary accent, warm highlights |
| `--gold-300` | `#F4C77B` | Tertiary warm accent, badges |
| `--gold-500` | `#E9A93C` | Tournament accent, "energy" CTAs (use sparingly) |

### Neutrals (warm cream + espresso — the cozy chrome)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#FBF3E7` | App background — warm cream |
| `--surface` | `#FFFDF9` | Cards, sheets, tables — soft warm white |
| `--surface-2` | `#F5EAD9` | Subtle raised/sunken surfaces |
| `--border` | `#EADCC6` | Hairline borders (warm) |
| `--text` | `#3D2419` | Primary text — deep espresso brown (not pure black; warmer) |
| `--text-2` | `#A88B6A` | Secondary text — muted warm tan |
| `--text-3` | `#C0AD92` | Tertiary — captions, placeholders |

### Semantic (kept warm-compatible)
| Token | Hex | Use |
|---|---|---|
| `--win` | `#5B8C3E` | Wins, success, confirmed scores (warm-leaning green) |
| `--loss` | `#C44536` | Losses, errors, disputes (brick red, harmonizes with coral) |
| `--warn` | `#E9A93C` | Pending confirmation, warnings (shares gold-500) |
| `--info` | `#E8643C` | Info (shares coral-500) |
| `--live` | `#E8643C` | Live match pulse (coral-500) |

**Discipline rule:** coral is the protagonist; apricot and gold are guests. Gold is reserved mainly for tournament context and the occasional high-energy CTA. Never put coral and gold at equal weight on the same screen — coral leads, the others accent.

---

## 3. Typography

Three roles. Warm & welcoming with energy means a confident, friendly display face for impact, a clean neutral body, and tabular numerics for data.

### Display / headings — **Outfit** (or Space Grotesk as alt)
Geometric, modern, friendly. Used for page titles, team names, score numerals, section headers. Loaded via `next/font`.
- Weights: 500, 600, 700
- Tight letter-spacing on large sizes (`-0.02em`)

### Body / UI — **Inter**
The workhorse. All body copy, form labels, buttons, navigation.
- Weights: 400, 500, 600

### Numeric / data — **Inter** with `font-variant-numeric: tabular-nums`
For standings tables, scores, stats. Tabular figures so columns align. The big score display uses **Outfit** for that signature confident look.

### Type scale (rem, 16px base)
| Token | Size | Line height | Use |
|---|---|---|---|
| `text-display` | 2.5rem / 40px | 1.1 | Hero, big scores |
| `text-h1` | 2rem / 32px | 1.15 | Page titles |
| `text-h2` | 1.5rem / 24px | 1.2 | Section headers |
| `text-h3` | 1.25rem / 20px | 1.3 | Card titles |
| `text-base` | 1rem / 16px | 1.5 | Body |
| `text-sm` | 0.875rem / 14px | 1.45 | Secondary, table cells |
| `text-xs` | 0.75rem / 12px | 1.4 | Captions, labels, eyebrows |

**Signature numerals:** match scores render in Outfit 600–700 at `text-display` or larger, with the winning side's score in `--coral-700` and a subtle weight bump; the losing side in `--text-3`/muted tan. This is the one place the design raises its voice — like a scoreboard at sunset.

---

## 4. Spacing, radius, shadow

### Spacing
Tailwind's default scale (4px base). Generous but not loose — warmth and "welcoming" come from breathing room around cards and rows.
- Card padding: `p-5` (20px) mobile, `p-6` (24px) desktop
- Section gaps: `gap-6` / `gap-8`
- Table row height: comfortable — `h-12` (48px) so taps land easily on mobile

### Radius (balanced rounding — the "slightly rounded" choice)
| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 6px | Inputs, badges, small controls |
| `--radius` | 10px | **Default** — buttons, cards |
| `--radius-lg` | 14px | Sheets, modals, large cards |
| `--radius-full` | 9999px | Pills, avatars, status dots |

10px is the heartbeat — soft and friendly, still crisp. Not pill-shaped, not boxy.

### Shadow (soft, low, warm-tinted — never heavy)
| Token | Value |
|---|---|
| `--shadow-sm` | `0 1px 2px rgba(122, 59, 46, 0.05)` |
| `--shadow` | `0 2px 10px rgba(122, 59, 46, 0.07)` |
| `--shadow-lg` | `0 8px 24px rgba(122, 59, 46, 0.10)` |

Shadows are tinted with a warm brown (`#7A3B2E`) hue, not neutral gray, so they harmonize with the sunset palette. Elevation is soft shadow + warm hairline border, never heavy dark drops.

---

## 5. Component conventions

Built on shadcn/ui — these are the customizations over the primitives.

- **Buttons.** Primary = `--coral-500` fill, white text, `--radius`. Hover → `--coral-600`. Secondary = warm-white fill, `--border` border, `--text` label. Gold CTA (rare) = `--gold-500` fill. Min height 44px on mobile for thumbs.
- **Cards.** Warm-white surface (`--surface`), `--border` hairline, `--shadow`, `--radius`. No heavy borders.
- **Standings table.** The centerpiece. Tabular numerals always. Header row in `--text-2` uppercase `text-xs` tracking-wide. Row hover → `--coral-50`. The position number (`Pos`) is a clickable pill button that opens the tiebreaker modal — style as a small `--coral-100` pill with `--coral-900` text that brightens on hover, signaling it's interactive (serves the OVA-style tiebreaker explainer). Non-qualifying positions use a neutral `--surface-2` pill with `--text-2`.
- **Status pills.** Scheduled = `--surface-2` / `--text-2`. Live = `--coral-50` fill, `--coral-900` text, with a soft pulsing `--coral-500` dot. Final = `--text-2`. Disputed = `--loss` tint. Pending confirmation = `--gold` tint.
- **Score display.** Big Outfit numerals. Winner's score emphasized (heavier weight + `--coral-700`); loser muted tan. Set-by-set scores in a clean row beneath in `--text-2`.
- **Match card.** Team names left (color-dot or initials avatar), score right in signature numerals, status pill top-left, venue/court/time as `text-sm` `--text-2`.
- **Forms.** shadcn inputs, `--radius-sm`, `--border`, focus ring in `--coral-400`. Inline zod errors in `--loss` `text-sm`. Labels `text-sm` `--text` `font-medium`.
- **Empty states.** Centered, a quiet warm icon in `--text-3`, a one-line explanation, single primary action. Never an empty box. (e.g., "No matches scheduled yet. Generate a schedule to get started." + button.)
- **Bottom nav (mobile).** Home, Schedule, Standings, Profile. Active tab in `--coral-500`, inactive `--text-3`. Warm-white surface, top hairline border, upward `--shadow`.

---

## 6. The signature element

**The "sunset scoreboard" — score numerals + the live standings row.**

Every app shows standings in a table. Ours does two things nobody else does well:

1. **Tiebreaker pill** — the position number is a tappable coral pill. Tapping it opens the OVA-style explanation ("Sorting teams by matches won / played between tied teams…") with the actual ratios. This turns the most confusing part of volleyball standings into the app's most trustworthy, delightful detail. The thing organizers will mention.
2. **Signature score numerals** — Outfit, large, confident, winner in burnt coral. Scores are the emotional payload of the app; they should look like a real tournament scoreboard catching the last of the sun, not a spreadsheet cell.

Everything else stays warm and quiet so these two moments carry the identity.

---

## 7. Motion

Restrained and purposeful. Energetic but never bouncy-cute.

- Transitions: 150–200ms, ease-out. Tailwind defaults are fine.
- **Live match pulse:** the "Live" status dot gently pulses (`--coral-500`), 2s loop. The one ambient animation.
- **Score commit:** when a confirmed score lands, the affected standings row briefly flashes `--coral-50` and the changed numbers tick up. Optimistic, satisfying, fast.
- **Page transitions:** none heavy — instant navigation with skeletons, not spinners.
- Respect `prefers-reduced-motion`: disable the pulse and tick animations.

---

## 8. Accessibility floor (non-negotiable)

- Contrast: all text meets WCAG AA on its background. `--text` (espresso) on `--bg` (cream) and `--surface` is well above 4.5:1.
- **Warm-palette risk:** never use coral/apricot/gold as small body text on light backgrounds — they fail contrast. Orange/gold are for fills, large score numerals, and accents only. Body text is always espresso `--text`. Verify `--text-2` meets AA for its sizes; use `--text` where in doubt.
- Coral-500 on white passes AA for large text and UI components; for small text on coral fills use white or `--coral-900`.
- Visible keyboard focus rings (`--coral-400`) on every interactive element.
- Tap targets ≥44px on mobile.
- Don't encode meaning in color alone — wins/losses also use W/L text, status pills also use labels.

---

## 9. Dark mode

Not in v0. The token structure (CSS variables) is built so a warm dark theme (deep espresso bg, cream text, coral accents) can be added later by swapping variable values under a `.dark` selector — no component rewrites. Deferred to post-v0 per PRD.

---

## 10. Implementation note for Claude Code

Apply these tokens in `app/globals.css` as CSS custom properties under `@theme` (Tailwind v4 style), wired so shadcn's semantic tokens map onto the palette:

- `--primary` → `--coral-500`, `--primary-foreground` → white
- `--background` → `--bg`, `--foreground` → `--text`
- `--card` → `--surface`, `--card-foreground` → `--text`
- `--muted` → `--surface-2`, `--muted-foreground` → `--text-2`
- `--accent` → `--coral-50`, `--accent-foreground` → `--coral-900`
- keep `--secondary` neutral (warm-white/`--surface-2`); introduce gold as a dedicated `--accent-warm` token used explicitly for tournament UI
- `--destructive` → `--loss`
- `--ring` → `--coral-400`
- `--radius` → 10px

Load **Outfit** (display) and **Inter** (body) via `next/font/google` in the root layout. Expose Outfit as `--font-display` and use it for headings + score numerals.

After wiring, the existing Phase 2 auth pages should automatically pick up the new warm palette — verify they look right in the new skin.
