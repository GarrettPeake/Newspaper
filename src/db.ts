import type { Env } from './index';

export interface Article {
  id: number;
  title: string;
  url: string | null;
  hn_url: string;
  hn_score: number;
  hn_comments: number;
  interest_level: number;
  interest_reason: string;
  processed_at: number;
  read_at: number | null;
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

export async function getInterestingUnread(env: Env, threshold: number, page: number): Promise<Page> {
  const offset = (page - 1) * PAGE_SIZE;
  const res = await env.DB.prepare(
    'SELECT * FROM articles WHERE read_at IS NULL AND interest_level >= ? ORDER BY hn_score DESC LIMIT ? OFFSET ?'
  )
    .bind(threshold, PAGE_SIZE + 1, offset)
    .all<Article>();
  return toPage(res.results);
}

export async function getUninterestingUnread(env: Env, threshold: number, page: number): Promise<Page> {
  const offset = (page - 1) * PAGE_SIZE;
  const res = await env.DB.prepare(
    'SELECT * FROM articles WHERE read_at IS NULL AND interest_level < ? ORDER BY processed_at DESC LIMIT ? OFFSET ?'
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

export async function getArticle(env: Env, id: number): Promise<Article | null> {
  return env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first<Article>();
}

export async function markRead(env: Env, id: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('UPDATE articles SET read_at = ? WHERE id = ? AND read_at IS NULL')
    .bind(now, id)
    .run();
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
    "UPDATE articles SET hn_score = ?, hn_comments = ?, interest_level = 10, interest_reason = 'Large comment growth' WHERE id = ?"
  )
    .bind(hnScore, hnComments, id)
    .run();
}

export async function updateCounts(env: Env, id: number, hnScore: number, hnComments: number): Promise<void> {
  await env.DB.prepare('UPDATE articles SET hn_score = ?, hn_comments = ? WHERE id = ?')
    .bind(hnScore, hnComments, id)
    .run();
}

export async function insertArticle(env: Env, a: Omit<Article, 'read_at'>): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO articles
      (id, title, url, hn_url, hn_score, hn_comments, interest_level, interest_reason, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(a.id, a.title, a.url, a.hn_url, a.hn_score, a.hn_comments, a.interest_level, a.interest_reason, a.processed_at)
    .run();
}
