-- A record of individual sign-ups that were removed, and why.
--
-- Until now, deleting a sign-up left NOTHING. `registration_payments` cascades
-- off `free_agents`, so the person, the fee they paid and the fact a removal
-- happened all disappeared together: no audit row (`match_audit` is matches
-- only), no restore point, no trace. That was accepted when the rule changed on
-- 2026-09-21 to let organizers delete off-platform payments — and then
-- immediately regretted, which is what this fixes. BVL's organizer removes
-- people who withdrew and refunded them through their own PayPal; the app
-- should be able to say that happened.
--
-- Deliberately NOT restore_points. That table is schedule-shaped:
-- `restoreFromPointAction` casts the payload to a SnapshotPayload, resolves
-- teams and rebuilds fixtures, and `getRestorePoints` has no scope filter — a
-- sign-up snapshot parked there would appear in the Restore points card
-- reading "0 fixtures" beside a button that runs the schedule path.
--
-- Cascades with the competition rather than surviving it (the opposite of
-- restore_points). A restore point exists precisely to outlive a deletion; this
-- is a note in the organizer's own books, and keeping a withdrawn person's name
-- and email after their whole league is gone is exposure with no purpose.

create table if not exists "removed_signups" (
  "id" uuid primary key default gen_random_uuid(),
  "org_id" uuid not null references "organizations"("id") on delete cascade,
  "competition_id" uuid not null
    references "competitions"("id") on delete cascade,
  -- The sign-up this was, for reference only. NOT a foreign key: the row it
  -- pointed at is deleted in the same breath as this one is written.
  "free_agent_id" uuid not null,
  "name" text not null,
  "email" text,
  -- Where they stood when they were removed: available / placed /
  -- pending_payment / withdrawn. Kept as text — this is a historical record,
  -- and it should not break if the enum is ever changed.
  "status_at_removal" text not null,
  -- Summary of what they had actually paid, so the list reads without anyone
  -- parsing the payload. Organizer's net, after refunds.
  "paid_cents" integer not null default 0,
  "payment_count" integer not null default 0,
  -- card / paypal / etransfer, as found. Empty when they never paid.
  "payment_methods" text[] not null default '{}',
  -- The whole sign-up and every payment row, exactly as they were. The summary
  -- above is derived from this; this is the truth.
  "payload" jsonb not null,
  -- The organizer's own words. Why they went, whether they were refunded.
  -- Editable afterwards — the reason is often known later than the removal.
  "note" text,
  "removed_by_user_id" uuid references "users"("id") on delete set null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
--> statement-breakpoint

create index if not exists "removed_signups_competition_idx"
  on "removed_signups" ("competition_id", "created_at" desc);
--> statement-breakpoint

create index if not exists "removed_signups_org_idx"
  on "removed_signups" ("org_id", "created_at" desc);
--> statement-breakpoint

alter table "removed_signups" enable row level security;
--> statement-breakpoint

-- Organizer-only, like restore_points. This holds a named person's email and
-- what they paid; nobody else has any business reading it.
create policy "removed_signups_select" on "removed_signups"
  for select to authenticated using (public.is_org_admin("org_id"));
--> statement-breakpoint

create policy "removed_signups_insert" on "removed_signups"
  for insert to authenticated with check (public.is_org_admin("org_id"));
--> statement-breakpoint

-- UPDATE is allowed here, unlike restore_points, and it is the whole point: the
-- note is written and rewritten after the fact. The application only ever sets
-- `note`; nothing in the app edits the snapshot.
create policy "removed_signups_update" on "removed_signups"
  for update to authenticated using (public.is_org_admin("org_id"))
  with check (public.is_org_admin("org_id"));
--> statement-breakpoint

-- An organizer can purge an entry outright — it is their record.
create policy "removed_signups_delete" on "removed_signups"
  for delete to authenticated using (public.is_org_admin("org_id"));
--> statement-breakpoint

comment on table "removed_signups" is
  'Individual sign-ups deleted by an organizer, with a snapshot of the sign-up and its payments plus an editable note. Written by remove_free_agent(); cascades with the competition.';
--> statement-breakpoint

-- Snapshot and delete in one call.
--
-- The app cannot do this atomically: the Supabase client issues each statement
-- separately, so an insert followed by a delete can leave a record of a removal
-- that did not happen, or a deletion with no record. Both are wrong, and the
-- second is the one that cannot be noticed.
--
-- Carries ONLY the admin check, exactly like delete_competition. The rule about
-- WHICH sign-ups may be deleted (card money never, off-platform money yes)
-- lives in `canDeleteSignup` in TypeScript, where it is unit-tested. Restating
-- it here in plpgsql would be a second copy free to drift from the first —
-- which is how 0123 silently dropped three behaviours.
create or replace function public.remove_free_agent(
  _free_agent_id uuid,
  _note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _fa            record;
  _comp          record;
  _removed_id    uuid;
  _paid          integer;
  _count         integer;
  _methods       text[];
  _payments      jsonb;
begin
  select * into _fa from free_agents where id = _free_agent_id;
  if not found then
    raise exception 'unknown sign-up';
  end if;

  select c.id, c.org_id, c.name into _comp
    from competitions c where c.id = _fa.competition_id;

  if not public.is_competition_admin(_comp.id) then
    raise exception 'not authorized to remove this sign-up';
  end if;

  -- Organizer's net, after refunds — the same figure the payments panel shows.
  -- Only a settled charge moved money; a pending one is an abandoned checkout.
  select
    coalesce(sum(
      case when p.status in ('paid', 'refunded')
        then greatest(p.price_cents - p.refunded_cents, 0)
        else 0 end
    ), 0)::integer,
    count(*)::integer,
    coalesce(array_agg(distinct p.method::text)
             filter (where p.method is not null), '{}'),
    coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]'::jsonb)
  into _paid, _count, _methods, _payments
  from registration_payments p
  where p.free_agent_id = _free_agent_id;

  insert into removed_signups (
    org_id, competition_id, free_agent_id, name, email,
    status_at_removal, paid_cents, payment_count, payment_methods,
    payload, note, removed_by_user_id
  ) values (
    _comp.org_id, _comp.id, _fa.id, _fa.name, _fa.email,
    _fa.status::text, _paid, _count, _methods,
    jsonb_build_object(
      'signup', to_jsonb(_fa),
      'payments', _payments,
      'competitionName', _comp.name,
      'removedAt', now()
    ),
    nullif(btrim(coalesce(_note, '')), ''),
    auth.uid()
  )
  returning id into _removed_id;

  -- The payment rows go with it, by cascade. That is the behaviour the caller
  -- has already decided is acceptable; the snapshot above is what makes it so.
  delete from free_agents where id = _free_agent_id;

  return _removed_id;
end;
$$;
--> statement-breakpoint

grant execute on function public.remove_free_agent(uuid, text) to authenticated;
