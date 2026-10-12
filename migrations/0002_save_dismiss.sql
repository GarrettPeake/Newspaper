ALTER TABLE articles ADD COLUMN saved_at     INTEGER;
ALTER TABLE articles ADD COLUMN dismissed_at INTEGER;

CREATE INDEX idx_saved     ON articles(saved_at);
CREATE INDEX idx_dismissed ON articles(dismissed_at);
