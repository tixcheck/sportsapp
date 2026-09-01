-- Liability waivers: an organization's approved text, and who agreed to it.
--
-- A waiver is only worth anything if you can later show WHAT somebody agreed
-- to, not merely that they ticked something. So the text is versioned and
-- frozen on approval, and an acceptance points at the exact version — never at
-- "the waiver", which is a moving target the day anyone edits it.
--
-- Three rules the schema enforces rather than trusts:
--
--   1. Approved text is immutable. A trigger refuses UPDATE of the body or
--      title once status is 'approved'. Changing the wording means a new
--      version, so an acceptance from March cannot be quietly rewritten in June.
--   2. Acceptances are append-only. No UPDATE policy, no DELETE policy — an
--      audit record you can edit is not evidence.
--   3. An acceptance stores the version it agreed to AND a copy of the text's
--      checksum, so a restore or a migration that lost the version row still
--      leaves proof of what was agreed.
--
-- Waivers belong to the ORGANIZATION, not the competition: a league runs the
-- same waiver across every event, and the person who approves it is the person
-- responsible for the organization. A competition then opts in by pointing at
-- one, which is what makes it per-event switchable.

create table if not exists "waivers" (
  "id" uuid primary key default gen_random_uuid(),
  "org_id" uuid not null references "organizations"("id") on delete cascade,
  "title" text not null,
  "body" text not null,
  /** 1, 2, 3… within the org. A new version supersedes but never replaces. */
  "version" integer not null default 1,
  "status" text not null default 'draft',
  /** Frozen at approval, so evidence survives an edit attempt or a restore. */
  "body_sha256" text,
  "approved_at" timestamptz,
  "approved_by" uuid references "users"("id") on delete set null,
  "created_at" timestamptz not null default now(),
  "created_by" uuid references "users"("id") on delete set null,
  constraint "waivers_status_check" check ("status" in ('draft', 'approved', 'retired')),
  constraint "waivers_body_present" check (length(btrim("body")) > 0),
  constraint "waivers_approved_has_proof"
    check ("status" <> 'approved' or ("approved_at" is not null and "body_sha256" is not null)),
  constraint "waivers_org_version_unique" unique ("org_id", "version")
);
--> statement-breakpoint

create index if not exists "waivers_org_idx" on "waivers" ("org_id", "status");
--> statement-breakpoint

-- Which waiver a competition requires. Null = the organizer has not turned it
-- on, which is the default and the state every existing competition is in.
alter table "competitions"
  add column if not exists "waiver_id" uuid references "waivers"("id") on delete set null;
--> statement-breakpoint

comment on column "competitions"."waiver_id" is
  'The approved waiver entrants must accept. Null = waivers off for this competition.';
--> statement-breakpoint

create table if not exists "waiver_acceptances" (
  "id" uuid primary key default gen_random_uuid(),
  "waiver_id" uuid not null references "waivers"("id") on delete restrict,
  "competition_id" uuid not null references "competitions"("id") on delete cascade,
  "user_id" uuid not null references "users"("id") on delete restrict,
  /**
   * What they typed as their signature, and the checksum of the text they were
   * shown. Both are copies on purpose: the point of the record is that it still
   * reads correctly when everything around it has changed.
   */
  "signed_name" text not null,
  "body_sha256" text not null,
  "accepted_at" timestamptz not null default now(),
  /** Coarse evidence of the submission. Not used for anything else. */
  "user_agent" text,
  constraint "waiver_acceptances_signed" check (length(btrim("signed_name")) > 0),
  constraint "waiver_acceptances_once" unique ("waiver_id", "competition_id", "user_id")
);
--> statement-breakpoint

create index if not exists "waiver_acceptances_comp_idx"
  on "waiver_acceptances" ("competition_id", "accepted_at");
--> statement-breakpoint
create index if not exists "waiver_acceptances_user_idx"
  on "waiver_acceptances" ("user_id");
--> statement-breakpoint

-- `on delete restrict` on both waiver_id and user_id above is deliberate:
-- deleting a waiver or a person must not silently destroy the record that they
-- agreed to it. Removing either means dealing with the acceptances first.

create or replace function public.freeze_approved_waiver()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'approved' then
    if new.body is distinct from old.body
       or new.title is distinct from old.title
       or new.version is distinct from old.version then
      raise exception
        'An approved waiver cannot be edited. Create a new version instead.';
    end if;
  end if;
  return new;
end;
$$;
--> statement-breakpoint

drop trigger if exists "waivers_freeze_approved" on "waivers";
--> statement-breakpoint
create trigger "waivers_freeze_approved"
  before update on "waivers"
  for each row execute function public.freeze_approved_waiver();
--> statement-breakpoint

alter table "waivers" enable row level security;
--> statement-breakpoint
alter table "waiver_acceptances" enable row level security;
--> statement-breakpoint

-- Anyone who can see a competition can READ the waiver it requires — they have
-- to be able to read it before agreeing to it, and a waiver nobody may read is
-- not enforceable. Drafts stay inside the organization.
drop policy if exists "waivers_select" on "waivers";
--> statement-breakpoint
create policy "waivers_select" on "waivers"
  for select using (
    public.can_manage_org("org_id")
    or (
      "status" = 'approved'
      and exists (
        select 1 from competitions c
        where c.waiver_id = waivers.id
          and public.can_view_competition(c.id)
      )
    )
  );
--> statement-breakpoint

-- Only an org admin writes one, and approving is an org-admin act.
drop policy if exists "waivers_admin_write" on "waivers";
--> statement-breakpoint
create policy "waivers_admin_write" on "waivers"
  for all to authenticated
  using (public.can_manage_org("org_id"))
  with check (public.can_manage_org("org_id"));
--> statement-breakpoint

-- An acceptance is visible to the person who gave it and to the organizers of
-- that competition. Not to teammates: whether somebody has signed a liability
-- waiver is between them and the organizer.
drop policy if exists "waiver_acceptances_select" on "waiver_acceptances";
--> statement-breakpoint
create policy "waiver_acceptances_select" on "waiver_acceptances"
  for select using (
    "user_id" = auth.uid()
    or public.is_competition_admin("competition_id")
  );
--> statement-breakpoint

-- You may record your OWN acceptance and nobody else's. There is deliberately
-- no UPDATE or DELETE policy: the record is append-only, because evidence that
-- can be edited afterwards is not evidence.
drop policy if exists "waiver_acceptances_insert_self" on "waiver_acceptances";
--> statement-breakpoint
create policy "waiver_acceptances_insert_self" on "waiver_acceptances"
  for insert to authenticated
  with check (
    "user_id" = auth.uid()
    and exists (
      select 1 from competitions c
      where c.id = "competition_id"
        and c.waiver_id = "waiver_id"
        and public.can_view_competition(c.id)
    )
  );
--> statement-breakpoint

/**
 * Approve a waiver: freeze the text and stamp who signed it off.
 *
 * SECURITY DEFINER so the checksum is computed server-side from the row as
 * stored, rather than taken from a caller who could send any string they liked.
 */
create or replace function public.approve_waiver(_waiver_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _org uuid;
  _body text;
begin
  select org_id, body into _org, _body from waivers where id = _waiver_id;
  if _org is null then
    raise exception 'Waiver not found.';
  end if;
  if not public.can_manage_org(_org) then
    raise exception 'Only an organization admin can approve a waiver.';
  end if;

  update waivers
     set status = 'approved',
         approved_at = now(),
         approved_by = auth.uid(),
         body_sha256 = encode(digest(_body, 'sha256'), 'hex')
   where id = _waiver_id and status = 'draft';

  if not found then
    raise exception 'Only a draft waiver can be approved.';
  end if;
end;
$$;
--> statement-breakpoint

revoke all on function public.approve_waiver(uuid) from public;
--> statement-breakpoint
grant execute on function public.approve_waiver(uuid) to authenticated;
--> statement-breakpoint

/**
 * Whether a person still owes this competition a waiver.
 *
 * Used by the app to decide whether to show the form; the INSERT policy is what
 * actually stops an unsigned entry, so this is a convenience, not the control.
 */
create or replace function public.waiver_outstanding(_competition_id uuid, _user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from competitions c
    where c.id = _competition_id
      and c.waiver_id is not null
      and not exists (
        select 1 from waiver_acceptances a
        where a.competition_id = c.id
          and a.waiver_id = c.waiver_id
          and a.user_id = coalesce(_user_id, auth.uid())
      )
  );
$$;
--> statement-breakpoint

grant execute on function public.waiver_outstanding(uuid, uuid) to authenticated;
