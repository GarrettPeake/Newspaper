import type { Env } from './index';

export interface Article {
  id: number;
  title: string;
  url: string | null;
  canonical_url: string | null;
  hn_id: number | null;
  hn_score: number | null;
  hn_comments: number | null;
  lobsters_id: string | null;
  lobsters_score: number | null;
  lobsters_comments: number | null;
  interest_level: number;
  processed_at: number;
  read_at: number | null;
  saved_at: number | null;
  dismissed_at: number | null;
}

export const PAGE_SIZE = 30;

// Lobsters scores run roughly an order of magnitude below HN's.
const POPULARITY = '(COALESCE(hn_score, 0) + 5 * COALESCE(lobsters_score, 0))';

export interface Page {
  items: Article[];
  hasMore: boolean;
}

function toPage(rows: Article[]): Page {
  const hasMore = rows.length > PAGE_SIZE;
  return { items: hasMore ? rows.slice(0, PAGE_SIZE) : rows, hasMore };
}

export async function getFeedBatch(
  env: Env,
  threshold: number,
  sinceTimestamp: number,
  excludeIds: number[],
  limit: number
): Promise<Article[]> {
  const exclude = excludeIds.length
    ? ` AND id NOT IN (${excludeIds.map(() => '?').join(',')})`
    : '';
  const sql =
    'SELECT * FROM articles ' +
    'WHERE read_at IS NULL AND dismissed_at IS NULL AND interest_level >= ? AND processed_at >= ?' +
    exclude +
    ' ORDER BY interest_level DESC, ' + POPULARITY + ' DESC LIMIT ?';
  const res = await env.DB.prepare(sql)
    .bind(threshold, sinceTimestamp, ...excludeIds, limit)
    .all<Article>();
  return res.results;
}

export async function getUninterestingUnread(env: Env, threshold: number, page: number): Promise<Page> {
  const offset = (page - 1) * PAGE_SIZE;
  const res = await env.DB.prepare(
    'SELECT * FROM articles WHERE read_at IS NULL AND dismissed_at IS NULL AND interest_level < ? ORDER BY processed_at DESC LIMIT ? OFFSET ?'
  )
    .bind(threshold, PAGE_SIZE + 1, offset)
    .all<Article>();
  return toPage(res.results);
}

export async function getRead(env: Env, page: number): Promise<Page> {
  const offset = (page - 1) * PAGE_SIZE;
  const res = await env.DB.prepare(
    'SELECT * FROM articles WHERE read_at IS NOT NULL ORDER BY read_at DESC LIMIT ? OFFSET ?'
  )
    .bind(PAGE_SIZE + 1, offset)
    .all<Article>();
  return toPage(res.results);
}

export async function getSaved(env: Env, page: number): Promise<Page> {
  const offset = (page - 1) * PAGE_SIZE;
  const res = await env.DB.prepare(
    'SELECT * FROM articles WHERE saved_at IS NOT NULL ORDER BY saved_at DESC LIMIT ? OFFSET ?'
  )
    .bind(PAGE_SIZE + 1, offset)
    .all<Article>();
  return toPage(res.results);
}

export async function getArticle(env: Env, id: number): Promise<Article | null> {
  return env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first<Article>();
}

export async function markRead(env: Env, id: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('UPDATE articles SET read_at = ? WHERE id = ? AND read_at IS NULL')
    .bind(now, id)
    .run();
}

export async function markSaved(env: Env, id: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('UPDATE articles SET saved_at = ? WHERE id = ? AND saved_at IS NULL')
    .bind(now, id)
    .run();
}

export async function unmarkSaved(env: Env, id: number): Promise<void> {
  await env.DB.prepare('UPDATE articles SET saved_at = NULL WHERE id = ?').bind(id).run();
}

export async function markDismissed(env: Env, id: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('UPDATE articles SET dismissed_at = ? WHERE id = ? AND dismissed_at IS NULL')
    .bind(now, id)
    .run();
}

export async function unmarkDismissed(env: Env, id: number): Promise<void> {
  await env.DB.prepare('UPDATE articles SET dismissed_at = NULL WHERE id = ?').bind(id).run();
}

export type Source = 'hn' | 'lobsters';

// Per-source column names; fixed strings, safe to interpolate into SQL.
const COLS = {
  hn: { id: 'hn_id', score: 'hn_score', comments: 'hn_comments' },
  lobsters: { id: 'lobsters_id', score: 'lobsters_score', comments: 'lobsters_comments' },
} as const;

export interface SourceStats {
  source: Source;
  sourceId: number | string;
  score: number;
  comments: number;
}

export interface ExistingRow {
  id: number;
  comments: number | null;
}

export async function getBySourceId(env: Env, source: Source, sourceId: number | string): Promise<ExistingRow | null> {
  const c = COLS[source];
  return env.DB.prepare(`SELECT id, ${c.comments} AS comments FROM articles WHERE ${c.id} = ?`)
    .bind(sourceId)
    .first<ExistingRow>();
}

export async function getIdByCanonicalUrl(env: Env, canonical: string): Promise<number | null> {
  const row = await env.DB.prepare('SELECT id FROM articles WHERE canonical_url = ?').bind(canonical).first<{ id: number }>();
  return row?.id ?? null;
}

// Sets this source's id and counts on an existing article; `burst` also bumps it
// to the top of the feed.
export async function updateSource(env: Env, id: number, s: SourceStats, burst = false): Promise<void> {
  const c = COLS[s.source];
  await env.DB.prepare(
    `UPDATE articles SET ${c.id} = ?, ${c.score} = ?, ${c.comments} = ?${burst ? ', interest_level = 100' : ''} WHERE id = ?`
  )
    .bind(s.sourceId, s.score, s.comments, id)
    .run();
}

// Inserts a scored article. If another source inserted the same link meanwhile,
// merges this source's stats into that row instead.
export async function insertArticle(
  env: Env,
  a: { title: string; url: string | null; canonical_url: string | null; interest_level: number },
  s: SourceStats
): Promise<void> {
  const c = COLS[s.source];
  await env.DB.prepare(
    `INSERT INTO articles (title, url, canonical_url, ${c.id}, ${c.score}, ${c.comments}, interest_level, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(canonical_url) DO UPDATE SET
       ${c.id} = excluded.${c.id}, ${c.score} = excluded.${c.score}, ${c.comments} = excluded.${c.comments}
     ON CONFLICT DO NOTHING`
  )
    .bind(a.title, a.url, a.canonical_url, s.sourceId, s.score, s.comments, a.interest_level, Math.floor(Date.now() / 1000))
    .run();
}
