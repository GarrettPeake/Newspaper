import type { Env, QueueMsg } from './index';
import * as hn from './hn';
import * as lobsters from './lobsters';
import { fetchArticleBody } from './extract';
import { analyzeArticle } from './llm';
import { canonicalUrl } from './url';
import { getBySourceId, getIdByCanonicalUrl, updateSource, insertArticle, type SourceStats } from './db';

export async function handleQueue(batch: MessageBatch<QueueMsg>, env: Env, _ctx: ExecutionContext): Promise<void> {
  // Concurrent so one message's OpenRouter retries/backoff don't stall the rest of the batch.
  await Promise.all(
    batch.messages.map(async (msg) => {
      try {
        await processOne(env, msg.body);
        msg.ack();
      } catch (e) {
        console.error('queue process failed', msg.body, e);
        msg.retry({ delaySeconds: 60 });
      }
    })
  )
}

// A story from either source, normalized for ingestion.
interface Candidate {
  stats: SourceStats;
  title: string;
  url: string | null;
  text: string;
  tags: string[];
  getComments: () => Promise<string>;
  // Comment count above which a jump in comments bumps the story to the top.
  burstMin: number;
}

async function toCandidate(msg: QueueMsg): Promise<Candidate | null> {
  if (msg.source === 'lobsters') {
    const s = msg.story;
    return {
      stats: { source: 'lobsters', sourceId: s.short_id, score: s.score, comments: s.comment_count },
      title: s.title,
      url: s.url || null,
      text: s.description_plain,
      tags: s.tags,
      getComments: () => lobsters.getCommentsText(s.short_id),
      burstMin: 20,
    };
  }
  // Messages without a source predate Lobsters support and are HN.
  const id = msg.id;
  const item = await hn.getItem(id);
  if (!item || item.dead || item.deleted || !item.title) return null;
  if (item.type && item.type !== 'story') return null;
  return {
    stats: { source: 'hn', sourceId: id, score: item.score ?? 0, comments: item.descendants ?? 0 },
    title: item.title,
    url: item.url ?? null,
    text: item.text ? hn.decodeAndStrip(item.text).slice(0, 8000) : '',
    tags: [],
    getComments: () => hn.getCommentsText(id),
    burstMin: 50,
  };
}

async function processOne(env: Env, msg: QueueMsg): Promise<void> {
  const c = await toCandidate(msg);
  if (!c) return;
  const { stats } = c;
  const label = `${stats.source}:${stats.sourceId}`;

  const existing = await getBySourceId(env, stats.source, stats.sourceId);
  if (existing) {
    const prev = existing.comments ?? 0;
    const burst = stats.comments > 3 * prev && stats.comments > c.burstMin;
    await updateSource(env, existing.id, stats, burst);
    if (burst) console.log(`burst-bumped ${label}: ${prev} -> ${stats.comments}`);
    return;
  }

  // Same link already ingested from the other source: attach, don't re-score.
  const canonical = canonicalUrl(c.url);
  if (canonical) {
    const dupId = await getIdByCanonicalUrl(env, canonical);
    if (dupId !== null) {
      await updateSource(env, dupId, stats);
      console.log(`merged ${label} into article ${dupId}`);
      return;
    }
  }

  const body = c.url ? await fetchArticleBody(c.url, env.JINA_API_KEY) : c.text;
  const comments = await c.getComments();

  const score = await analyzeArticle(env, {
    title: c.title,
    url: c.url,
    source: stats.source === 'hn' ? 'Hacker News' : 'Lobsters',
    sourceScore: stats.score,
    sourceComments: stats.comments,
    tags: c.tags,
    body,
    comments,
  });

  await insertArticle(env, { title: c.title, url: c.url, canonical_url: canonical, interest_level: score }, stats);
  console.log(`analyzed ${label}: ${score}`);
}
