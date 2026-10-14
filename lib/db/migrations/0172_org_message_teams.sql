-- Organizer messages to chosen teams, not only whole events.
--
-- BVL, 2026-10-14: Terry Miller's Thursday times moved 30 minutes, and the
-- convenor wanted to tell only the 11 teams playing there, not all 55 in the
-- league. The send action now takes an optional list of teams inside the
-- selected events (it still derives every address itself); this records which
-- teams a message went to, so the log says "11 teams in Thursday 6s" and not
-- "Thursday 6s".
--
-- NULL means the whole of each event, which is every message sent before this.

alter table "org_messages"
  add column if not exists "team_ids" uuid[];
