-- Phase 9: notification log lockdown + one-click unsubscribe.
--
-- notification_log is written only by the trusted weekly-digest cron (secret
-- key, which bypasses RLS). Enable RLS with NO policy so no anon/authenticated
-- client can read or write it via the API.

alter table "notification_log" enable row level security;
--> statement-breakpoint

-- One-click unsubscribe from the weekly digest. Callable unauthenticated (the
-- link in the email), keyed on the unguessable per-user token. SECURITY DEFINER
-- so it can flip the pref without the visitor being logged in; only ever turns
-- the weekly digest off for the token's owner.
create or replace function public.unsubscribe(_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  _hit int;
begin
  update users set notify_weekly = false where unsubscribe_token = _token;
  get diagnostics _hit = row_count;
  return _hit > 0;
end;
$$;
--> statement-breakpoint
grant execute on function public.unsubscribe(uuid) to anon, authenticated;