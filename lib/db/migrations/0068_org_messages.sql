-- Organizer broadcasts — "tell everyone in these events something".
--
-- Two pieces: a per-user opt-out, and a record of what was sent.
--
-- The opt-out is its own column rather than reusing notify_results or
-- notify_weekly. Those are about the app telling you things; this is a human
-- with a microphone, and someone may well want the schedule emails and not the
-- announcements. Defaults true so existing players keep receiving what their
-- organizer sends until they say otherwise.
--
-- The log exists because a broadcast is irreversible. An organizer needs to see
-- what they already sent (and to whom, and how many), and CASL expects a record
-- of commercial messages. Recipient COUNT is stored, never the address list --
-- the addresses are already in users, and copying them here would spread PII
-- for no gain.

alter table "users"
  add column "notify_org_messages" boolean not null default true;
--> statement-breakpoint

create table "org_messages" (
  "id" uuid primary key default gen_random_uuid() not null,
  "org_id" uuid not null references "organizations"("id") on delete cascade,
  "sent_by" uuid references "users"("id") on delete set null,
  "subject" text not null,
  "body" text not null,
  -- Which competitions the audience was drawn from, for the "sent to" summary.
  "competition_ids" uuid[] not null default '{}',
  "audience" text not null default 'players',
  "recipient_count" integer not null default 0,
  "failed_count" integer not null default 0,
  "created_at" timestamptz not null default now(),
  constraint "org_messages_subject_len" check (char_length("subject") between 1 and 200),
  constraint "org_messages_body_len" check (char_length("body") between 1 and 10000),
  constraint "org_messages_audience_valid" check ("audience" in ('players', 'captains'))
);
--> statement-breakpoint

create index "org_messages_org_idx" on "org_messages" ("org_id", "created_at" desc);
--> statement-breakpoint

alter table "org_messages" enable row level security;
--> statement-breakpoint

-- Only the org's own admins can see what the org has sent. Players receive the
-- email; they have no business reading the send history.
create policy "org_messages_select_admin" on "org_messages"
  for select to authenticated
  using (public.is_org_admin("org_id") or public.is_platform_admin());
--> statement-breakpoint

-- Written by the send action after Resend accepts the batch, so the row
-- reflects what actually went out rather than what was attempted.
create policy "org_messages_insert_admin" on "org_messages"
  for insert to authenticated
  with check (public.is_org_admin("org_id"));
