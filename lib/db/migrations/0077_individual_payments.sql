-- Paying for an individual sign-up.
--
-- Migration 0076 gave `registration_payments` a nullable `team_id` and a
-- `free_agent_id`. This adds the write path: the RPC that opens a charge for a
-- free agent, and the RLS/uniqueness rules that keep it honest.
--
-- Deliberately a SIBLING of start_registration_payment rather than an extra
-- branch inside it. That function's authorization question is "are you on this
-- team, or the organizer"; a free agent has no team, so the question is "is
-- this your own sign-up, or are you the organizer". Bolting a second identity
-- model onto one function is how authorization bugs happen.

-- One open charge per free agent. Without this, two tabs produce two Stripe
-- sessions and the player can pay twice.
create unique index if not exists "registration_payments_one_open_individual"
  on "registration_payments" ("free_agent_id")
  where "kind" = 'individual' and "status" = 'pending';
--> statement-breakpoint

-- A free agent must be able to READ their own payment rows to see whether the
-- fee landed. The existing select policy is written in terms of team
-- membership, which they have none of.
do $$ begin
  create policy "registration_payments_select_own_free_agent"
    on "registration_payments"
    for select to authenticated
    using (
      "free_agent_id" is not null
      and exists (
        select 1 from free_agents fa
        where fa.id = "registration_payments"."free_agent_id"
          and fa.user_id = (select auth.uid())
      )
    );
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

create or replace function public.start_individual_payment(
  _competition_id uuid,
  _free_agent_id uuid,
  _price_cents integer,
  _tax_cents integer,
  _platform_fee_cents integer,
  _total_cents integer,
  _application_fee_cents integer,
  _stripe_account_id text,
  _livemode boolean,
  _session_id text
)
returns text language plpgsql security definer set search_path = public as $$
declare
  _existing text;
begin
  -- Your own sign-up, or the organizer paying on your behalf (someone who
  -- handed over cash at the door and needs the row squared off).
  if not (
    public.is_competition_admin(_competition_id)
    or exists (
      select 1 from free_agents fa
      where fa.id = _free_agent_id and fa.user_id = auth.uid()
    )
  ) then
    raise exception 'Only this player or the organizer can pay this sign-up.';
  end if;

  -- The free agent must actually belong to this competition. Without this a
  -- caller could bill one competition's fee against another's sign-up.
  if not exists (
    select 1 from free_agents fa
    where fa.id = _free_agent_id and fa.competition_id = _competition_id
  ) then
    raise exception 'That sign-up is not in this competition.';
  end if;

  select stripe_checkout_session_id into _existing
  from registration_payments
  where free_agent_id = _free_agent_id
    and kind = 'individual'
    and status = 'pending';

  if _existing is not null then
    return _existing;
  end if;

  insert into registration_payments (
    competition_id, free_agent_id, kind, payer_email,
    price_cents, tax_cents, platform_fee_cents,
    total_cents, application_fee_cents,
    stripe_account_id, livemode, stripe_checkout_session_id
  )
  select
    _competition_id, _free_agent_id, 'individual', fa.email,
    _price_cents, _tax_cents, _platform_fee_cents,
    _total_cents, _application_fee_cents,
    _stripe_account_id, _livemode, _session_id
  from free_agents fa
  where fa.id = _free_agent_id
  on conflict do nothing;

  -- Re-read: a concurrent call may have won the partial unique index above.
  select stripe_checkout_session_id into _existing
  from registration_payments
  where free_agent_id = _free_agent_id
    and kind = 'individual'
    and status = 'pending';

  return _existing;
end;
$$;
--> statement-breakpoint

revoke all on function public.start_individual_payment(
  uuid, uuid, integer, integer, integer, integer, integer, text, boolean, text
) from public;
--> statement-breakpoint

grant execute on function public.start_individual_payment(
  uuid, uuid, integer, integer, integer, integer, integer, text, boolean, text
) to authenticated;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Placing a free agent on a team.
-- ---------------------------------------------------------------------------
--
-- The organizer's half of the feature: turn people into a team, or top up a
-- team that is short. Both end with the same two writes — a `team_members` row
-- and the free agent marked 'placed' — so they share one function.
--
-- SECURITY DEFINER because it writes `team_members` for OTHER users, which no
-- RLS policy on that table would ever allow a third party to do.
create or replace function public.place_free_agents(
  _team_id uuid,
  _free_agent_ids uuid[]
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  _competition_id uuid;
  _placed integer := 0;
  _fa record;
begin
  select competition_id into _competition_id from teams where id = _team_id;
  if _competition_id is null then
    raise exception 'Unknown team.';
  end if;

  if not public.is_competition_admin(_competition_id) then
    raise exception 'Only an organizer can place players.';
  end if;

  for _fa in
    select id, user_id, status, placed_team_id
      from free_agents
     where id = any(_free_agent_ids)
       and competition_id = _competition_id
       -- A withdrawn player is not available to place, and re-placing someone
       -- already on a team should move them, not silently double-add.
       and status in ('available', 'placed')
  loop
    -- A free agent whose account was deleted still gets marked placed, so the
    -- organizer's roster reflects the decision; there is just no user to add.
    if _fa.user_id is not null then
      -- Moving between teams is a MOVE, not a copy. Without this the player
      -- stays on their old roster and shows up on two teams at once.
      if _fa.placed_team_id is not null and _fa.placed_team_id <> _team_id then
        delete from team_members
         where team_id = _fa.placed_team_id
           and user_id = _fa.user_id
           -- Never strip a captain off their own team as a side effect.
           and role <> 'captain';
      end if;

      insert into team_members (team_id, user_id, role)
      values (_team_id, _fa.user_id, 'player')
      on conflict (team_id, user_id) do nothing;
    end if;

    update free_agents
       set status = 'placed', placed_team_id = _team_id, updated_at = now()
     where id = _fa.id;

    _placed := _placed + 1;
  end loop;

  return _placed;
end;
$$;
--> statement-breakpoint

revoke all on function public.place_free_agents(uuid, uuid[]) from public;
--> statement-breakpoint
grant execute on function public.place_free_agents(uuid, uuid[]) to authenticated;
