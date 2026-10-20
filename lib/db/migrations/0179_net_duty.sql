-- Net duty: the app names which team puts the net up on each court.
--
-- BVL (Theresa, 2026-10-19): "everybody has to do Nets, and no team is doing
-- it more than others", so setup doesn't fall on the referee. One of the two
-- teams in the first game on each court in a gym that night sets up, balanced
-- across the round (lib/scheduler/net-duty.ts). Computed on read from the
-- schedule, like standings, so a moved game or a redraw updates it.
--
-- Off by default; an organizer switches it on in the league's settings.

alter table "league_settings"
  add column if not exists "net_duty" boolean not null default false;
