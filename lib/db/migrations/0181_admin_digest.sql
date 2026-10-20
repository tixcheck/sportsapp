-- The organizers' Sunday to-do email, and its opt-out.
--
-- Its own column rather than notify_weekly: that one is "your matches this
-- week" as a player, and an organizer who also plays may want one and not the
-- other. Defaults true because the owner asked for every organizer to get it
-- (2026-10-20).
--
-- The column grant also adds notify_org_messages, which 0068 added to users
-- but never granted: the profile form updates all its toggles in one call, so
-- saving notification settings failed for everyone with "permission denied
-- for column notify_org_messages".

alter table "users"
  add column if not exists "notify_admin_digest" boolean not null default true;
--> statement-breakpoint

grant update (notify_org_messages, notify_admin_digest) on public.users to authenticated;
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
  elsif _kind = 'admin' then
    update users set notify_admin_digest = false where unsubscribe_token = _token;
  elsif _kind = 'all' then
    update users set
      notify_weekly = false,
      notify_results = false,
      notify_schedule_changes = false,
      notify_org_messages = false,
      notify_admin_digest = false
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
