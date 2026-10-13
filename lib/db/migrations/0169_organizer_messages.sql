-- Org organizers can message their players.
--
-- Indru (BVL convenor, an org 'organizer'): "how do we access it? Can it be
-- deployed to captains / captains and players etc for specific divisions?
-- Need to send something before making rule changes otherwise teams will be
-- confused." The message tool was owner/admin only, so the convenors who run
-- the divisions couldn't use it. An organizer already has full access to
-- every competition in the org (0029), so mailing those players is no new
-- power. Reading the send history comes with it, so a convenor can see what
-- has already gone out.

drop policy if exists "org_messages_select_admin" on "org_messages";
--> statement-breakpoint
create policy "org_messages_select_admin" on "org_messages"
  for select to authenticated
  using (public.is_org_member("org_id") or public.is_platform_admin());
--> statement-breakpoint
drop policy if exists "org_messages_insert_admin" on "org_messages";
--> statement-breakpoint
create policy "org_messages_insert_admin" on "org_messages"
  for insert to authenticated
  with check (public.is_org_member("org_id") and sent_by = auth.uid());
