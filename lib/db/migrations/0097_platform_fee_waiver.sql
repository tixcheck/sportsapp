-- Waive the platform fee for one competition.
--
-- The fee is currently automatic: every paid registration carries the platform's
-- cut, computed from the global rates in `platform_fee_settings`. That is the
-- right default and the wrong only-option while the platform is being promoted
-- — a free run for an organizer's first tournament is a sales tool, and there
-- was no way to give one short of editing the global rates for everybody.
--
-- Deliberately NOT an org-admin setting. An organizer who could switch off the
-- platform's fee on their own event would switch it off on all of them, so this
-- is the platform admin's to grant. `is_platform_admin()` gates the setter and
-- the UPDATE policy on `competitions` never exposes the column, because the
-- setter is SECURITY DEFINER and the only way in.
--
-- Waiving affects only the PLATFORM's cut. Stripe still takes its processing
-- fee — that is Stripe's money, not ours to forgive — so a waived event is
-- cheaper for the payer but not free to run.

alter table "competitions"
  add column if not exists "platform_fee_waived" boolean not null default false;
--> statement-breakpoint

comment on column "competitions"."platform_fee_waived" is
  'When true the platform takes no cut of this competition''s registrations. Platform admin only; set via set_platform_fee_waived().';
--> statement-breakpoint

create or replace function public.set_platform_fee_waived(
  _competition_id uuid,
  _waived boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin can waive the platform fee.';
  end if;

  update competitions
     set platform_fee_waived = coalesce(_waived, false)
   where id = _competition_id;

  if not found then
    raise exception 'Competition not found.';
  end if;
end;
$$;
--> statement-breakpoint

comment on function public.set_platform_fee_waived is
  'Turn the platform fee on or off for one competition. Platform admin only.';
--> statement-breakpoint

revoke all on function public.set_platform_fee_waived(uuid, boolean) from public;
--> statement-breakpoint
grant execute on function public.set_platform_fee_waived(uuid, boolean) to authenticated;
