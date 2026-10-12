-- Support multiple sources (HN + Lobsters) per article, deduped by canonical URL.
-- `id` becomes an internal key; existing rows keep their id (the old HN id) so
-- links and saved/read/dismissed state carry over untouched.

CREATE TABLE articles_new (
  id                INTEGER PRIMARY KEY,
  title             TEXT    NOT NULL,
  url               TEXT,
  canonical_url     TEXT,
  hn_id             INTEGER,
  hn_score          INTEGER,
  hn_comments       INTEGER,
  lobsters_id       TEXT,
  lobsters_score    INTEGER,
  lobsters_comments INTEGER,
  interest_level    INTEGER NOT NULL,
  processed_at      INTEGER NOT NULL,
  read_at           INTEGER,
  saved_at          INTEGER,
  dismissed_at      INTEGER
);

-- canonical_url is left NULL for existing rows: old HN reposts can share a URL,
-- and the feed only looks back 3 days anyway.
INSERT INTO articles_new
  (id, title, url, hn_id, hn_score, hn_comments, interest_level, processed_at, read_at, saved_at, dismissed_at)
SELECT id, title, url, id, hn_score, hn_comments, interest_level, processed_at, read_at, saved_at, dismissed_at
FROM articles;

DROP TABLE articles;
ALTER TABLE articles_new RENAME TO articles;

CREATE UNIQUE INDEX idx_hn_id         ON articles(hn_id);
CREATE UNIQUE INDEX idx_lobsters_id   ON articles(lobsters_id);
CREATE UNIQUE INDEX idx_canonical_url ON articles(canonical_url);
CREATE INDEX idx_feed          ON articles(read_at, interest_level);
CREATE INDEX idx_uninteresting ON articles(read_at, interest_level, processed_at);
CREATE INDEX idx_read          ON articles(read_at);
CREATE INDEX idx_saved         ON articles(saved_at);
CREATE INDEX idx_dismissed     ON articles(dismissed_at);
