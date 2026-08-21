-- Waitlist: what happens when a tier or a competition is full.
--
-- WHY A SEPARATE TABLE, NOT A TEAM STATUS.
--
-- The obvious move is a `waitlisted` value on `team_status`. It is a trap. Every
-- reader of `teams` — schedule generation, standings, pools, the public team
-- list, player stats, the payments dashboard — currently excludes by naming the
-- statuses it doesn't want. Adding a fourth means auditing all of them, and the
-- day one is missed a team that never registered appears in a fixture.
--
-- So a waitlist row stores the registration REQUEST — the same fields the
-- registration form collects — and promotion calls `register_team` with them.
-- One registration path, so invites, captain linking, display-name seeding,
-- payment gating and the caps all behave identically whether a team walked up
-- or waited. Nothing downstream learns a new status.
--
-- HOW A SPOT IS FILLED.
--
-- Not by enrolling the first team. A team that signed up three weeks ago may
-- have joined another league since, and auto-enrolling them into
-- `pending_payment` re-blocks the very spot the waitlist existed to fill. So the
-- spot is OFFERED, with a deadline the organizer sets; an unclaimed offer
-- expires and cascades to the next team.
--
-- An outstanding offer HOLDS the spot. Without that, a team is told a spot is
-- theirs and then loses it to a walk-up registration before they can click —
-- which is worse than never having been offered it.

do $$ begin
  create type "waitlist_status" as enum (
    -- In the queue, nothing offered yet.
    'waiting',
    -- Holding an offer that hasn't expired. Occupies a spot.
    'offered',
    -- Turned into a real team. `promoted_team_id` says which.
    'claimed',
    -- The offer ran out. Kept, not deleted, so the organizer can see what
    -- happened and re-offer by hand if they want to.
    'expired',
    -- Withdrew, or the organizer removed them.
    'removed'
  );
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

-- How long a team has to claim. On `competitions` rather than the per-type
-- settings tables so leagues and tournaments share one rule, matching
-- `allow_individual_signups`.
alter table "competitions"
  add column if not exists "waitlist_claim_hours" integer not null default 48;
--> statement-breakpoint

do $$ begin
  alter table "competitions"
    add constraint "competitions_waitlist_claim_hours_range"
    check ("waitlist_claim_hours" between 1 and 336);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

create table if not exists "waitlist_entries" (
  "id" uuid primary key default gen_random_uuid() not null,
  "competition_id" uuid not null references "competitions"("id") on delete cascade,
  -- The tier they want. Null for an untiered competition. A tier can be full
  -- while the competition isn't, and vice versa, so the queue is per tier.
  "division_id" uuid references "divisions"("id") on delete set null,

  "team_name" text not null,
  "captain_user_id" uuid references "users"("id") on delete set null,
  "contact_email" text not null,
  -- Same shape as team_registrations.player_emails, so promotion can hand it
  -- straight to register_team.
  "player_emails" jsonb not null default '[]'::jsonb,

  "status" waitlist_status not null default 'waiting',
  "offered_at" timestamptz,
  "offer_expires_at" timestamptz,
  -- Single-use secret in the claim link. Null until offered.
  "claim_token" text unique,
  "promoted_team_id" uuid references "teams"("id") on delete set null,

  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),

  constraint "waitlist_entries_name_not_blank" check (btrim("team_name") <> ''),
  constraint "waitlist_entries_email_shape"
    check ("contact_email" ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  -- An offer without a deadline would hold a spot for ever.
  constraint "waitlist_entries_offer_complete" check (
    ("status" <> 'offered')
    or ("offered_at" is not null and "offer_expires_at" is not null
        and "claim_token" is not null)
  ),
  constraint "waitlist_entries_claimed_has_team" check (
    ("status" = 'claimed') = ("promoted_team_id" is not null)
  ),
  -- One live queue position per person per competition. Someone who was
  -- expired or removed may join again, so this only covers the live states.
  constraint "waitlist_entries_one_live_per_user"
    exclude ("competition_id" with =, "captain_user_id" with =)
    where ("status" in ('waiting', 'offered') and "captain_user_id" is not null)
);
--> statement-breakpoint

create index if not exists "waitlist_entries_queue_idx"
  on "waitlist_entries" ("competition_id", "division_id", "created_at")
  where "status" = 'waiting';
--> statement-breakpoint

create index if not exists "waitlist_entries_expiry_idx"
  on "waitlist_entries" ("offer_expires_at")
  where "status" = 'offered';
--> statement-breakpoint

alter table "waitlist_entries" enable row level security;
--> statement-breakpoint

-- The organizer sees the queue; a team sees only its own place in it. The row
-- carries a contact email, so it is not public.
create policy "waitlist_select" on "waitlist_entries"
  for select to authenticated
  using (
    public.is_competition_admin("competition_id")
    or "captain_user_id" = (select auth.uid())
  );
--> statement-breakpoint

create policy "waitlist_admin_write" on "waitlist_entries"
  for update to authenticated
  using (public.is_competition_admin("competition_id"))
  with check (public.is_competition_admin("competition_id"));
--> statement-breakpoint

create policy "waitlist_admin_delete" on "waitlist_entries"
  for delete to authenticated
  using (public.is_competition_admin("competition_id"));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Capacity, counted once, in one place.
-- ---------------------------------------------------------------------------
--
-- A spot is taken by an active team OR by an unexpired offer. Both counts have
-- to agree everywhere — register_team, the "is it full" check the form reads,
-- and the offer logic — or a spot gets double-sold.
create or replace function public.competition_spots_taken(
  _competition_id uuid,
  _division_id uuid default null,
  _ignore_waitlist_entry uuid default null
) returns integer
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      select count(*)::int from teams t
       where t.competition_id = _competition_id
         and t.status <> 'withdrawn'
         and (_division_id is null or t.division_id = _division_id)
    )
    +
    (
      select count(*)::int from waitlist_entries w
       where w.competition_id = _competition_id
         and w.status = 'offered'
         and w.offer_expires_at > now()
         and (_division_id is null or w.division_id is not distinct from _division_id)
         and (_ignore_waitlist_entry is null or w.id <> _ignore_waitlist_entry)
    );
$$;
--> statement-breakpoint

grant execute on function public.competition_spots_taken(uuid, uuid, uuid)
  to anon, authenticated;
--> statement-breakpoint

/**
 * Is this competition (or one of its tiers) out of room?
 *
 * Used by the registration page to decide whether to offer a form or a
 * waitlist, and by join_waitlist to refuse a queue nobody needs to be in.
 */
create or replace function public.competition_is_full(
  _competition_id uuid,
  _division_id uuid default null
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _type competition_type;
  _max integer;
  _tier_max integer;
begin
  select c.type into _type from competitions c where c.id = _competition_id;
  if not found then return false; end if;

  select case when _type = 'tournament' then ts.max_teams else ls.max_teams end
    into _max
    from competitions c
    left join league_settings ls on ls.competition_id = c.id
    left join tournament_settings ts on ts.competition_id = c.id
   where c.id = _competition_id;

  if _max is not null
     and public.competition_spots_taken(_competition_id, null) >= _max then
    return true;
  end if;

  if _division_id is not null then
    select d.max_teams into _tier_max from divisions d where d.id = _division_id;
    if _tier_max is not null
       and public.competition_spots_taken(_competition_id, _division_id) >= _tier_max then
      return true;
    end if;
  end if;

  return false;
end;
$$;
--> statement-breakpoint

grant execute on function public.competition_is_full(uuid, uuid)
  to anon, authenticated;
