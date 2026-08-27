# Brand assets

Raster versions of the wordmark, for places that can't take an SVG — Stripe
Connect branding, app stores, social cards, anything that asks for a PNG under a
size limit.

The source of truth is still `public/mysportsapp-logo.svg` one directory up.
Everything here is derived from it and should be regenerated rather than edited
by hand.

| File | Size | What it's for |
| --- | --- | --- |
| `mysportsapp-logo.png` | 1248 × 306, transparent | Checkout headers, invoices, emails |
| `mysportsapp-icon.png` | 512 × 512, opaque | Avatar-sized slots — Connect onboarding, Express dashboard |
| `mysportsapp-icon.svg` | vector | Source for the icon PNG |

## Why the icon isn't the wordmark

The icon gets rendered at 32–48px. "mysportsapp" at that size is a smudge, so
the icon is just the ball mark from the wordmark, scaled up with even padding.

It sits on claret (`#8E2C3B`) rather than the app's cream paper because it is
composited on white nearly everywhere it appears, and a cream square on white
has no edge. Checked down to 32px — the seams still read.

## Brand colours

```
#8E2C3B   claret   primary buttons, the icon ground
#E8643C   orange   the swoosh under the wordmark; accents and links
```

These match `--claret` in `app/globals.css`, so a player moving from a
registration page to Stripe checkout sees the same colour rather than Stripe's
default blue.

## Regenerating

Both PNGs come out of headless Chrome. There is no build step — they change so
rarely that a documented command beats a script nobody runs.

```bash
# Icon — 512x512, opaque
chrome --headless=new --disable-gpu --hide-scrollbars \
  --window-size=512,512 \
  --screenshot=public/brand/mysportsapp-icon.png \
  file:///absolute/path/to/public/brand/mysportsapp-icon.svg

# Logo — transparent, 1200px of art plus 20/24 padding
#   art height = 1200 * 105/475 = 265, so 1248 x 306 overall.
# Wrap the SVG in a page that sets `img { width: 1200px }` and
# `.pad { padding: 20px 24px }`, then:
chrome --headless=new --disable-gpu --hide-scrollbars \
  --default-background-color=00000000 \
  --window-size=1248,306 \
  --screenshot=public/brand/mysportsapp-logo.png \
  file:///absolute/path/to/that/page.html
```

Keep the logo's padding minimal — Stripe and most other consumers add their own,
and extra transparent margin only makes the wordmark render smaller than it
should.

If the wordmark ever changes, the ball geometry is duplicated in
`mysportsapp-icon.svg` and has to be updated there too.
