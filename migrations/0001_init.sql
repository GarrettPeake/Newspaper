CREATE TABLE articles (
  id              INTEGER PRIMARY KEY,
  title           TEXT    NOT NULL,
  url             TEXT,
  hn_url          TEXT    NOT NULL,
  hn_score        INTEGER NOT NULL,
  hn_comments     INTEGER NOT NULL,
  interest_level  INTEGER NOT NULL,
  interest_reason TEXT    NOT NULL,
  processed_at    INTEGER NOT NULL,
  read_at         INTEGER
);

CREATE INDEX idx_feed          ON articles(read_at, interest_level, hn_score);
CREATE INDEX idx_uninteresting ON articles(read_at, interest_level, processed_at);
CREATE INDEX idx_read          ON articles(read_at);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
