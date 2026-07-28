-- Site reviews (user testimonials about the app), owner-moderated.
--
-- Public visitors read only APPROVED reviews; a signed-in user may write/see
-- their own (which starts 'pending'); the platform admin moderates (sees all,
-- flips status). One review per user (unique user_id) — re-submitting updates
-- it and returns it to 'pending' for re-approval, handled in the server action.

create type "review_status" as enum ('pending', 'approved', 'hidden');
--> statement-breakpoint

create table "reviews" (
  "id" uuid primary key default gen_random_uuid() not null,
  "user_id" uuid not null unique references "users"("id") on delete cascade,
  "author_name" text not null,
  "rating" integer not null,
  "comment" text not null,
  "status" "review_status" not null default 'pending',
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
--> statement-breakpoint

-- A rating must be 1–5; a comment can't be blank.
alter table "reviews" add constraint "reviews_rating_range"
  check ("rating" between 1 and 5);
--> statement-breakpoint
alter table "reviews" add constraint "reviews_comment_nonempty"
  check (length(btrim("comment")) > 0);
--> statement-breakpoint

alter table "reviews" enable row level security;
--> statement-breakpoint

-- Public (incl. anonymous) can read approved reviews — these are the ones shown
-- on the /reviews page.
create policy "reviews_select_approved" on "reviews"
  for select using (status = 'approved');
--> statement-breakpoint

-- A user can read their own review whatever its status (to show "pending review").
create policy "reviews_select_own" on "reviews"
  for select to authenticated using (user_id = auth.uid());
--> statement-breakpoint

-- The platform admin can read everything (moderation queue).
create policy "reviews_select_admin" on "reviews"
  for select to authenticated using (public.is_platform_admin());
--> statement-breakpoint

-- A user may create/update their own review; status can only ever be set to
-- 'pending' by a non-admin (the WITH CHECK forbids self-approval).
create policy "reviews_insert_own" on "reviews"
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
--> statement-breakpoint
create policy "reviews_update_own" on "reviews"
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and status = 'pending');
--> statement-breakpoint

-- The platform admin moderates: update any review's status.
create policy "reviews_moderate" on "reviews"
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
--> statement-breakpoint

create index "reviews_status_created_idx" on "reviews" ("status", "created_at" desc);
