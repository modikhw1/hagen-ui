-- Feed spans should persist against the global feed axis instead of only
-- viewport-relative fractions.

ALTER TABLE feed_spans
  ADD COLUMN IF NOT EXISTS start_feed_order int,
  ADD COLUMN IF NOT EXISTS end_feed_order int;
