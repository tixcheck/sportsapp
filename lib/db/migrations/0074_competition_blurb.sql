-- A competition can describe itself.
--
-- The registration page has had nothing to say beyond name, date and venue —
-- everything an organizer wants to tell a prospective team ("what the format
-- is", "who this is for", "what the vibe is") had nowhere to live, so they send
-- it round in a group chat instead and the page stays a form.
--
-- Two columns, deliberately dumb:
--
--   `description` is PLAIN TEXT. CLAUDE.md is explicit that v0 allows no rich
--   text, and a registration page open to the public internet is the worst
--   place to start accepting markup. Blank lines separate paragraphs — the same
--   convention `toParagraphs()` already uses for organizer broadcast emails —
--   and emoji survive perfectly well in plain text, which covers most of what
--   the formatting was doing anyway.
--
--   `banner_url` is a LINK, not an upload. There is no image upload anywhere in
--   this codebase — no storage bucket, no signed URLs, no size or type
--   validation — and adding one properly is its own piece of work. A pasted URL
--   gets the page looking right today without pretending we have an asset
--   pipeline. It renders in a plain <img>, so a broken link degrades to empty
--   space rather than a broken layout.

alter table "competitions"
  add column "description" text;
--> statement-breakpoint

alter table "competitions"
  add column "banner_url" text;
--> statement-breakpoint

-- Long enough for a real pitch, short enough that the page stays a page.
alter table "competitions"
  add constraint "competitions_description_length" check (
    "description" is null or length("description") <= 4000
  );
--> statement-breakpoint

-- Only http(s). Blocks `javascript:` and `data:` URLs from reaching an <img>
-- on a public page.
alter table "competitions"
  add constraint "competitions_banner_url_http" check (
    "banner_url" is null or "banner_url" ~* '^https?://'
  );
