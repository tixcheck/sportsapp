-- An organization that exists but isn't advertised.
--
-- The platform owner's Test Org carries a dozen sandbox competitions —
-- "BVL Test", a second "Mango Sports", half-built tournaments — and all of
-- them were listed on /find alongside real leagues. A player searching for a
-- Tuesday 6s found them, and a duplicate of a league they already play in is
-- worse than clutter: it looks like the real one and isn't.
--
-- NOT solved by marking them private. Private removes them from view
-- entirely, including for someone handed a direct link, and the point of a
-- sandbox is being able to send somebody a link to what you just built.
--
-- So: hidden from the index, unchanged everywhere else. An org-level flag
-- rather than a per-competition one because the whole organization is a
-- sandbox — setting it once should cover the twelfth thing built in it.

alter table "organizations"
  add column if not exists "hidden_from_discovery" boolean not null default false;
--> statement-breakpoint

comment on column "organizations"."hidden_from_discovery" is
  'Keep this org''s competitions out of public search. They stay reachable by direct link — this is not privacy, it is not advertising.';
