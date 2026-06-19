 -- 0033: null out per-pool match_format overrides the OLD size-based rule
  -- auto-applied (hardcoded best-of-3 15/15/11). A null override now means
  -- "use the tournament's chosen pool format". New explicit short overrides are
  -- 2-set (bestOf 2), so the bestOf=3 filter leaves them untouched.
  update public.pools
  set match_format = null
  where match_format->>'bestOf' = '3'
    and match_format->'setsToPoints' = '[15, 15, 11]'::jsonb;