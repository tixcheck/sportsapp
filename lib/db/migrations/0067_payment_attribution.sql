-- Attribute registration payments to the person who paid.
--
-- payer_user_id has existed since 0064 but was never populated, so "my
-- payments" could only be matched by email -- and a team_full charge carries no
-- payer email at all. Setting it from auth.uid() inside the SECURITY DEFINER
-- function is the only trustworthy place: a parameter could be forged, and the
-- webhook that settles the charge runs with no user context.
--
-- Body is the 0064 definition verbatim plus the attribution update.

create or replace function public.start_registration_payment(
  _competition_id uuid,
  _team_id uuid,
  _kind registration_payment_kind,
  _payer_email text,
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
  -- A team's own members pay for it; organizers can pay on their behalf (an
  -- org-added team, or an organizer taking payment at the door).
  if not (
    public.is_competition_admin(_competition_id)
    or exists (
      select 1 from team_members tm
      where tm.team_id = _team_id and tm.user_id = auth.uid()
    )
  ) then
    raise exception 'Only the team or the organizer can pay this registration.';
  end if;

  -- The team must actually belong to this competition.
  if not exists (
    select 1 from teams t
    where t.id = _team_id and t.competition_id = _competition_id
  ) then
    raise exception 'That team is not in this competition.';
  end if;

  select stripe_checkout_session_id into _existing
  from registration_payments
  where team_id = _team_id
    and status = 'pending'
    and kind = _kind
    and (_kind = 'team_full' or payer_email = _payer_email);

  if _existing is not null then
    return _existing;
  end if;

  insert into registration_payments (
    competition_id, team_id, kind, payer_email,
    price_cents, tax_cents, platform_fee_cents,
    total_cents, application_fee_cents,
    stripe_account_id, livemode, stripe_checkout_session_id
  ) values (
    _competition_id, _team_id, _kind, _payer_email,
    _price_cents, _tax_cents, _platform_fee_cents,
    _total_cents, _application_fee_cents,
    _stripe_account_id, _livemode, _session_id
  )
  on conflict do nothing;

  -- Attribute the charge to whoever actually started it. Taken from auth.uid()
  -- rather than a parameter: the caller must not be able to bill a payment to
  -- someone else's name, and this is the only place that knows for certain who
  -- is on the other end.
  update registration_payments
  set payer_user_id = auth.uid()
  where stripe_checkout_session_id = _session_id
    and payer_user_id is null;

  -- Re-read: a concurrent call may have won the partial unique index.
  select stripe_checkout_session_id into _existing
  from registration_payments
  where team_id = _team_id
    and status = 'pending'
    and kind = _kind
    and (_kind = 'team_full' or payer_email = _payer_email);

  return _existing;
end;
$$;
