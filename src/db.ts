import type { Env } from './index';

export interface Article {
  id: number;
  title: string;
  url: string | null;
  hn_url: string;
  hn_score: number;
  hn_comments: number;
  interest_level: number;
  processed_at: number;
  read_at: number | null;
  saved_at: number | null;
  dismissed_at: number | null;
}

export const PAGE_SIZE = 30;

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
    ' ORDER BY interest_level DESC, hn_score DESC LIMIT ?';
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

export interface ExistingRow {
  hn_comments: number;
  interest_level: number;
}

export async function getExisting(env: Env, id: number): Promise<ExistingRow | null> {
  return env.DB.prepare('SELECT hn_comments, interest_level FROM articles WHERE id = ?')
    .bind(id)
    .first<ExistingRow>();
}

export async function updateCommentBurst(env: Env, id: number, hnScore: number, hnComments: number): Promise<void> {
  await env.DB.prepare(
    "UPDATE articles SET hn_score = ?, hn_comments = ?, interest_level = 100 WHERE id = ?"
  )
    .bind(hnScore, hnComments, id)
    .run();
}

export async function updateCounts(env: Env, id: number, hnScore: number, hnComments: number): Promise<void> {
  await env.DB.prepare('UPDATE articles SET hn_score = ?, hn_comments = ? WHERE id = ?')
    .bind(hnScore, hnComments, id)
    .run();
}

export async function insertArticle(env: Env, a: Omit<Article, 'read_at' | 'saved_at' | 'dismissed_at'>): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO articles
      (id, title, url, hn_url, hn_score, hn_comments, interest_level, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(a.id, a.title, a.url, a.hn_url, a.hn_score, a.hn_comments, a.interest_level, a.processed_at)
    .run();
}
