-- Switch from 0-10 interest levels with reasons to a 0-100 decision score
-- (probability the reader wants the article).

-- Rows where analysis failed carry a fake score; drop untouched ones so the
-- next cron re-scores them. Saved/read/dismissed rows are kept.
DELETE FROM articles
WHERE interest_reason = 'Analysis failed'
  AND saved_at IS NULL AND read_at IS NULL AND dismissed_at IS NULL;

UPDATE articles SET interest_level = interest_level * 10;

ALTER TABLE articles DROP COLUMN interest_reason;

UPDATE settings SET value = CAST(CAST(value AS INTEGER) * 10 AS TEXT)
WHERE key = 'interest_threshold';
