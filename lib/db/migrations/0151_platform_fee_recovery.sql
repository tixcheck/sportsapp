-- Recover the platform fee on entries an organizer lets in without a card
-- payment, from that organizer's later card payments.
--
-- The owner, 2026-10-06, for Helix's Reverse Pairs: "If the org is admitting
-- players manually, can we ensure that for those manually admitted players,
-- the platform fee is added to the org account? Like take it from other
-- payments that might go through?" — and: Helix only for now (the other orgs
-- are on a free trial this season), and at most ONE recovered fee per payment.
--
-- An entry owes the fee when it is in (team `active`) without a paid CARD
-- payment — let in with "Admit anyway", or paid offline and confirmed. The
-- platform never handled that money, so it never took its cut. Card payments
-- here are Stripe destination charges whose `application_fee_amount` is the
-- platform's cut; a later card payment to the same organizer adds ONE owed
-- fee to it, coming out of the organizer's share (the payer pays the normal
-- price). The ledger below records which entry's fee was recovered by which
-- payment.
--
-- Life of a recovery row:
--   pending    claimed by a checkout that hasn't been paid yet. The claim is
--              what stops two simultaneous checkouts taking the same debt.
--   recovered  the payment went through (webhook).
--   (deleted)  checkout abandoned/expired, or the payment fully refunded —
--              Stripe returned the fee with it, so the debt is owed again.
-- A pending claim older than 25 hours is treated as dead (Checkout sessions
-- last 24), so a session nobody finished can't hold a debt forever.

alter table "organizations"
  add column if not exists "recover_manual_platform_fees" boolean not null default false;
--> statement-breakpoint

comment on column "organizations"."recover_manual_platform_fees" is
  'Recover the platform fee on entries admitted without a card payment from this org''s later card payments, one per payment (0151). Helix only as of 2026-10-06.';
--> statement-breakpoint

create table if not exists "platform_fee_recoveries" (
  "id" uuid primary key default gen_random_uuid(),
  "org_id" uuid not null references "organizations"("id") on delete cascade,
  -- The entry whose fee this recovers.
  "competition_id" uuid not null references "competitions"("id") on delete cascade,
  "team_id" uuid not null references "teams"("id") on delete cascade,
  "amount_cents" integer not null check ("amount_cents" > 0),
  "status" text not null check ("status" in ('pending', 'recovered')),
  -- The checkout that carries it, and who started that checkout.
  "stripe_checkout_session_id" text,
  "claimed_by_user_id" uuid,
  "claimed_at" timestamptz not null default now(),
  "recovered_at" timestamptz
);
--> statement-breakpoint

-- One live recovery per entry: a fee is recovered once.
create unique index if not exists "platform_fee_recoveries_one_per_team"
  on "platform_fee_recoveries" ("team_id");
--> statement-breakpoint
create index if not exists "platform_fee_recoveries_session"
  on "platform_fee_recoveries" ("stripe_checkout_session_id");
--> statement-breakpoint

alter table "platform_fee_recoveries" enable row level security;
--> statement-breakpoint

-- Organizers can see their own; nobody writes except through the functions
-- below and the Stripe webhook (trusted server, secret key).
drop policy if exists "platform_fee_recoveries_admin_read" on "platform_fee_recoveries";
--> statement-breakpoint
create policy "platform_fee_recoveries_admin_read" on "platform_fee_recoveries"
  for select using (public.is_competition_admin(competition_id));
--> statement-breakpoint

-- The platform fee one whole entry would have paid: the same rules as
-- lib/payments/platform-fee.ts for a single payment covering the entry, from
-- the same settings row. Zero on a waived competition.
create or replace function public.entry_platform_fee_cents(_competition_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when c.platform_fee_waived then 0
    when coalesce(cps.registration_fee_cents, 0) <= 0 then 0
    when c.type = 'reverse_pairs' then s.reverse_pairs_per_pair_cents
    when c.type = 'league' then s.league_per_team_cents
    else round(cps.registration_fee_cents * s.tournament_percent / 100.0)::int
  end
  from competitions c
  left join competition_payment_settings cps on cps.competition_id = c.id
  cross join lateral (select * from platform_fee_settings limit 1) s
  where c.id = _competition_id
$$;
--> statement-breakpoint

-- Entries in this org that owe their fee and haven't been claimed.
create or replace function public.platform_fee_debts(_org_id uuid)
returns table (team_id uuid, competition_id uuid, team_name text, fee_cents integer, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.competition_id, t.name,
         public.entry_platform_fee_cents(t.competition_id), t.created_at
    from teams t
    join competitions c on c.id = t.competition_id
   where c.org_id = _org_id
     and t.status = 'active'
     and (
       t.admitted_unpaid_at is not null
       or exists (select 1 from registration_payments p
                   where p.team_id = t.id and p.status = 'paid' and p.method <> 'card')
     )
     and not exists (select 1 from registration_payments p
                      where p.team_id = t.id and p.status = 'paid' and p.method = 'card')
     and not exists (select 1 from platform_fee_recoveries r
                      where r.team_id = t.id
                        and (r.status = 'recovered' or r.claimed_at > now() - interval '25 hours'))
     and public.entry_platform_fee_cents(t.competition_id) > 0
$$;
--> statement-breakpoint

revoke all on function public.platform_fee_debts(uuid) from public;
--> statement-breakpoint

-- A checkout claims ONE owed fee for its org (the owner's cap), oldest entry
-- first. Returns nothing when the org doesn't recover fees or nothing is owed.
-- Callable by the payer: it reveals only an id and an amount, and the payer
-- must belong to the team they're paying for (or run the competition).
create or replace function public.claim_platform_fee_debt(_paying_team_id uuid)
returns table (recovery_id uuid, amount_cents integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _org uuid;
  _comp uuid;
  _debt record;
  _id uuid;
begin
  if _uid is null then return; end if;
  select c.org_id, c.id into _org, _comp
    from teams t join competitions c on c.id = t.competition_id
   where t.id = _paying_team_id;
  if _org is null then return; end if;
  if not exists (select 1 from organizations o where o.id = _org and o.recover_manual_platform_fees) then
    return;
  end if;
  if not (
    exists (select 1 from team_members m where m.team_id = _paying_team_id and m.user_id = _uid)
    or public.is_competition_admin(_comp)
  ) then
    return;
  end if;

  -- A stale pending claim (abandoned checkout) is cleared so the debt can be
  -- claimed again.
  delete from platform_fee_recoveries
   where org_id = _org and status = 'pending' and claimed_at <= now() - interval '25 hours';

  select d.team_id, d.competition_id, d.fee_cents into _debt
    from public.platform_fee_debts(_org) d
   where d.team_id <> _paying_team_id
   order by d.created_at
   limit 1;
  if not found then return; end if;

  begin
    insert into platform_fee_recoveries (org_id, competition_id, team_id, amount_cents, status, claimed_by_user_id)
    values (_org, _debt.competition_id, _debt.team_id, _debt.fee_cents, 'pending', _uid)
    returning id into _id;
  exception when unique_violation then
    -- Another checkout claimed it a moment ago; this payment just carries none.
    return;
  end;

  recovery_id := _id;
  amount_cents := _debt.fee_cents;
  return next;
end;
$$;
--> statement-breakpoint

create or replace function public.attach_platform_fee_recovery(_recovery_id uuid, _session_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update platform_fee_recoveries
     set stripe_checkout_session_id = _session_id
   where id = _recovery_id and status = 'pending' and claimed_by_user_id = auth.uid()
$$;
--> statement-breakpoint

create or replace function public.release_platform_fee_recovery(_recovery_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from platform_fee_recoveries
   where id = _recovery_id and status = 'pending' and claimed_by_user_id = auth.uid()
$$;
--> statement-breakpoint

-- Has this team's own fee already been recovered from someone else's payment?
-- Then its own card payment carries no platform fee — never twice.
create or replace function public.team_fee_already_recovered(_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from platform_fee_recoveries r
                  where r.team_id = _team_id and r.status = 'recovered')
$$;
--> statement-breakpoint

-- For the organizer's Payments tab: what's owed and what's been recovered.
create or replace function public.platform_fee_recovery_summary(_competition_id uuid)
returns table (enabled boolean, owed_count integer, owed_cents integer, recovered_count integer, recovered_cents integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _org uuid;
begin
  if not public.is_competition_admin(_competition_id) then return; end if;
  select org_id into _org from competitions where id = _competition_id;
  enabled := coalesce((select recover_manual_platform_fees from organizations where id = _org), false);
  select count(*)::int, coalesce(sum(fee_cents), 0)::int into owed_count, owed_cents
    from public.platform_fee_debts(_org) d where d.competition_id = _competition_id;
  select count(*)::int, coalesce(sum(amount_cents), 0)::int into recovered_count, recovered_cents
    from platform_fee_recoveries r where r.competition_id = _competition_id and r.status = 'recovered';
  return next;
end;
$$;
--> statement-breakpoint

revoke all on function public.claim_platform_fee_debt(uuid) from public;
--> statement-breakpoint
grant execute on function public.claim_platform_fee_debt(uuid) to authenticated;
--> statement-breakpoint
revoke all on function public.attach_platform_fee_recovery(uuid, text) from public;
--> statement-breakpoint
grant execute on function public.attach_platform_fee_recovery(uuid, text) to authenticated;
--> statement-breakpoint
revoke all on function public.release_platform_fee_recovery(uuid) from public;
--> statement-breakpoint
grant execute on function public.release_platform_fee_recovery(uuid) to authenticated;
--> statement-breakpoint
grant execute on function public.team_fee_already_recovered(uuid) to authenticated;
--> statement-breakpoint
grant execute on function public.platform_fee_recovery_summary(uuid) to authenticated;
