-- An optional second brand colour, for a page background that matches a logo.
--
-- Helix Volleyball, 2026-09-30: "add the soft tinted background. Make it
-- appealing matching the logo colors." Helix's logo is a ring that runs from
-- magenta to teal; a single tint picks one end of it and reads as plain pink.
-- With a second colour the page washes from a tint of the accent at the top to
-- a tint of this one at the bottom (OrgTheme), under white cards.
--
-- Used only as a faint wash, never as text, so it needs no contrast handling.
-- Same `#rrggbb` check as 0144 — it is written into a <style> tag too.

alter table "organizations"
  add column if not exists "brand_secondary" text;
--> statement-breakpoint

do $$ begin
  alter table "organizations"
    add constraint "organizations_brand_secondary_hex"
    check ("brand_secondary" is null or "brand_secondary" ~ '^#[0-9a-f]{6}$');
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

comment on column "organizations"."brand_secondary" is
  'Optional second brand colour, #rrggbb lowercase. Tints the bottom of the org''s public pages (the accent tints the top).';
