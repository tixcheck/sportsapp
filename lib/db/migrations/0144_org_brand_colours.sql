-- An organization's brand colours, for its public event pages.
--
-- Helix Volleyball, 2026-09-30: "can we have the page with Helix Volleyball
-- logo and a page that matches the logo colors". The logo already reached the
-- registration page; the colours never did — every organizer's page was the
-- app's own beige and claret.
--
-- Two colours, not a palette: an ACCENT (buttons, highlights) and an optional
-- BACKGROUND. Everything else — text, card edges, the readable variant of the
-- accent — is derived by `embedTheme` (lib/embed/theme.ts), the same code that
-- already themes embedded schedules, which guarantees contrast. An organizer
-- choosing six colours would get one wrong and ship an unreadable page.
--
-- Stored as `#rrggbb` only, checked here as well as in the app: the value is
-- written into a <style> tag on a public page.

alter table "organizations"
  add column if not exists "brand_accent" text,
  add column if not exists "brand_background" text;
--> statement-breakpoint

do $$ begin
  alter table "organizations"
    add constraint "organizations_brand_accent_hex"
    check ("brand_accent" is null or "brand_accent" ~ '^#[0-9a-f]{6}$');
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

do $$ begin
  alter table "organizations"
    add constraint "organizations_brand_background_hex"
    check ("brand_background" is null or "brand_background" ~ '^#[0-9a-f]{6}$');
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

comment on column "organizations"."brand_accent" is
  'Brand accent for the org''s public event pages, #rrggbb lowercase. Null = the app''s own colours.';
--> statement-breakpoint

comment on column "organizations"."brand_background" is
  'Page background for the org''s public event pages, #rrggbb lowercase. Null with an accent = white.';
