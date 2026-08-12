-- Make "unsubscribe" turn off the thing the person actually unsubscribed from.
--
-- The 1-arg unsubscribe(_token) only ever set notify_weekly, because the weekly
-- digest was the only opt-out-able email. It isn't any more: the missing-score
-- nudge respects notify_results and organizer broadcasts respect
-- notify_org_messages. Every one of those footers pointed at a link that
-- switched off the digest and kept sending what the reader was objecting to.
--
-- That is a broken promise in the footer, and for a bulk send it is a CASL
-- problem, not a papercut.
--
-- The 1-arg signature is DROPPED rather than kept alongside: a 1-arg function
-- and a 2-arg one with a default make every existing call ambiguous. Callers
-- passing only _token still resolve to the new function via the default.

drop function if exists public.unsubscribe(uuid);
--> statement-breakpoint

create or replace function public.unsubscribe(
  _token uuid,
  _kind text default 'weekly'
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  _hit int;
begin
  -- An unrecognised kind falls through to the digest rather than erroring: a
  -- mangled link in an old email should still unsubscribe someone from
  -- something, and the digest is what every historical link meant.
  if _kind = 'results' then
    update users set notify_results = false where unsubscribe_token = _token;
  elsif _kind = 'schedule' then
    update users set notify_schedule_changes = false where unsubscribe_token = _token;
  elsif _kind = 'org_messages' then
    update users set notify_org_messages = false where unsubscribe_token = _token;
  elsif _kind = 'all' then
    update users set
      notify_weekly = false,
      notify_results = false,
      notify_schedule_changes = false,
      notify_org_messages = false
    where unsubscribe_token = _token;
  else
    update users set notify_weekly = false where unsubscribe_token = _token;
  end if;

  get diagnostics _hit = row_count;
  return _hit > 0;
end;
$$;
--> statement-breakpoint

grant execute on function public.unsubscribe(uuid, text) to anon, authenticated;
